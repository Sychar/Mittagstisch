import nodemailer, { Transporter } from "nodemailer";

type OrderReceivedEmailInput = {
  customerEmail: string;
  customerName: string;
  restaurantName: string;
  offerTitle: string;
  quantity: number;
  pickupTimeIso: string;
  fulfillmentType: "pickup" | "dinein";
};

type OrderStatusEmailInput = {
  customerEmail: string;
  customerName: string;
  restaurantName: string;
  offerTitle: string;
  status: "confirmed" | "cancelled";
};

type ReservationReceivedEmailInput = {
  customerEmail: string;
  customerName: string;
  restaurantName: string;
  partySize: number;
  reservationTimeIso: string;
};

type ReservationStatusEmailInput = {
  customerEmail: string;
  customerName: string;
  restaurantName: string;
  status: "confirmed" | "cancelled";
};

type RestaurantRegistrationNotifyAdminInput = {
  restaurantName: string;
  restaurantEmail: string;
  phone: string;
  address: string;
  postalCode: string;
  requestedAtIso: string;
};

type RestaurantRegistrationReceivedInput = {
  restaurantName: string;
  restaurantEmail: string;
};

type RestaurantRegistrationReviewedInput = {
  restaurantName: string;
  restaurantEmail: string;
  approvalStatus: "approved" | "rejected";
  note?: string;
};

type RestaurantSupportRequestInput = {
  restaurantName: string;
  restaurantEmail: string;
  phone: string;
  message: string;
  source?: string;
};

type RestaurantReviewReceivedInput = {
  restaurantName: string;
  restaurantEmail: string;
  rating: number;
  authorName?: string | null;
  text: string;
  dashboardUrl?: string;
};

type RestaurantReviewReportNotifyAdminInput = {
  restaurantName: string;
  restaurantEmail: string;
  reviewId: string;
  rating: number;
  authorName?: string | null;
  text: string;
  reasonLabel: string;
  note?: string | null;
};

type RestaurantReviewReportResolvedInput = {
  restaurantName: string;
  restaurantEmail: string;
  rating: number;
  decision: "kept" | "removed" | "restored";
  resolutionNote?: string | null;
};

type RestaurantPasswordResetCodeInput = {
  restaurantName: string;
  restaurantEmail: string;
  code: string;
  expiresAtIso: string;
};

const formatDateTimeDe = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
};

const normalizeEmail = (value: string): string => value.trim().toLowerCase();

const normalizeBaseUrl = (value: string | undefined, fallback: string): string =>
  (value || fallback).trim().replace(/\/+$/, "");

const truncateText = (value: string, maxLength: number): string => {
  const text = value.trim().replace(/\s+/g, " ");
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
};

export class EmailService {
  private readonly fromEmail: string;
  private readonly registrationNotifyEmail: string;
  private readonly reviewReportNotifyEmail: string;
  private readonly appPublicUrl: string;
  private readonly adminPublicUrl: string;
  private readonly transporter: Transporter | null;

  constructor() {
    const host = process.env.SMTP_HOST?.trim();
    const port = Number(process.env.SMTP_PORT || 0);
    const user = process.env.SMTP_USER?.trim();
    const pass = process.env.SMTP_PASS?.trim();
    this.fromEmail = (process.env.FROM_EMAIL || user || "").trim();
    this.registrationNotifyEmail = normalizeEmail(
      process.env.REGISTRATION_NOTIFY_EMAIL || "info@bundle.jetzt"
    );
    this.reviewReportNotifyEmail = normalizeEmail(
      process.env.REVIEW_REPORT_NOTIFY_EMAIL || this.registrationNotifyEmail
    );
    this.appPublicUrl = normalizeBaseUrl(process.env.APP_PUBLIC_URL, "https://app.nahundfein.com");
    this.adminPublicUrl = normalizeBaseUrl(
      process.env.ADMIN_PUBLIC_URL,
      "https://admin.nahundfein.com"
    );

    if (!host || !port || !user || !pass || !this.fromEmail) {
      this.transporter = null;
      return;
    }

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: {
        user,
        pass
      }
    });
  }

  isConfigured(): boolean {
    return Boolean(this.transporter);
  }

  async sendOrderReceived(input: OrderReceivedEmailInput): Promise<void> {
    const fulfillmentLabel = input.fulfillmentType === "pickup" ? "Abholung" : "Vor Ort";
    const pickupTime = formatDateTimeDe(input.pickupTimeIso);
    const subject = "Nah&Fein: Vorbestellung eingegangen";
    const text = [
      `Hallo ${input.customerName},`,
      "",
      `deine Vorbestellung bei ${input.restaurantName} ist bei uns eingegangen.`,
      `Gericht: ${input.offerTitle}`,
      `Menge: ${input.quantity}`,
      `Zeit: ${pickupTime}`,
      `Art: ${fulfillmentLabel}`,
      "",
      "Sobald das Restaurant entscheidet, bekommst du eine weitere E-Mail.",
      "",
      "Viele Grüße",
      "Nah&Fein"
    ].join("\n");

    await this.sendMail(input.customerEmail, subject, text);
  }

  async sendOrderStatus(input: OrderStatusEmailInput): Promise<void> {
    const accepted = input.status === "confirmed";
    const subject = accepted
      ? "Nah&Fein: Vorbestellung bestätigt"
      : "Nah&Fein: Vorbestellung abgelehnt";
    const decision = accepted ? "bestätigt" : "abgelehnt";
    const text = [
      `Hallo ${input.customerName},`,
      "",
      `deine Vorbestellung bei ${input.restaurantName} wurde ${decision}.`,
      `Gericht: ${input.offerTitle}`,
      "",
      "Viele Grüße",
      "Nah&Fein"
    ].join("\n");

    await this.sendMail(input.customerEmail, subject, text);
  }

  async sendReservationReceived(input: ReservationReceivedEmailInput): Promise<void> {
    const reservationTime = formatDateTimeDe(input.reservationTimeIso);
    const subject = "Nah&Fein: Reservierung eingegangen";
    const text = [
      `Hallo ${input.customerName},`,
      "",
      `deine Reservierungsanfrage bei ${input.restaurantName} ist eingegangen.`,
      `Personen: ${input.partySize}`,
      `Zeit: ${reservationTime}`,
      "",
      "Sobald das Restaurant entscheidet, bekommst du eine weitere E-Mail.",
      "",
      "Viele Grüße",
      "Nah&Fein"
    ].join("\n");

    await this.sendMail(input.customerEmail, subject, text);
  }

  async sendReservationStatus(input: ReservationStatusEmailInput): Promise<void> {
    const accepted = input.status === "confirmed";
    const subject = accepted
      ? "Nah&Fein: Reservierung bestätigt"
      : "Nah&Fein: Reservierung abgelehnt";
    const decision = accepted ? "bestätigt" : "abgelehnt";
    const text = [
      `Hallo ${input.customerName},`,
      "",
      `deine Reservierung bei ${input.restaurantName} wurde ${decision}.`,
      "",
      "Viele Grüße",
      "Nah&Fein"
    ].join("\n");

    await this.sendMail(input.customerEmail, subject, text);
  }

  async sendRestaurantRegistrationNotifyAdmin(
    input: RestaurantRegistrationNotifyAdminInput
  ): Promise<void> {
    const requestedAt = formatDateTimeDe(input.requestedAtIso);
    const subject = "Nah&Fein: Neue Restaurant-Registrierung";
    const text = [
      "Neue Registrierung eingegangen.",
      "",
      `Restaurant: ${input.restaurantName}`,
      `E-Mail: ${input.restaurantEmail}`,
      `Telefon: ${input.phone}`,
      `Adresse: ${input.address}`,
      `PLZ: ${input.postalCode}`,
      `Zeit: ${requestedAt}`,
      "",
      "Bitte im Admin-Bereich prüfen und freigeben oder ablehnen."
    ].join("\n");

    await this.sendMail(this.registrationNotifyEmail, subject, text);
  }

  async sendRestaurantRegistrationReceived(
    input: RestaurantRegistrationReceivedInput
  ): Promise<void> {
    const subject = "Nah&Fein: Registrierung eingegangen";
    const text = [
      `Hallo ${input.restaurantName},`,
      "",
      "deine Registrierung ist bei uns eingegangen.",
      "Wir prüfen deine Angaben und schalten dein Konto danach frei.",
      "",
      "Sobald entschieden wurde, bekommst du eine weitere E-Mail.",
      "",
      "Viele Grüße",
      "Nah&Fein"
    ].join("\n");

    await this.sendMail(input.restaurantEmail, subject, text);
  }

  async sendRestaurantRegistrationReviewed(
    input: RestaurantRegistrationReviewedInput
  ): Promise<void> {
    const approved = input.approvalStatus === "approved";
    const subject = approved
      ? "Nah&Fein: Registrierung freigeschaltet"
      : "Nah&Fein: Registrierung abgelehnt";

    const text = [
      `Hallo ${input.restaurantName},`,
      "",
      approved
        ? "dein Restaurant-Konto wurde freigeschaltet. Du kannst dich jetzt einloggen."
        : "deine Restaurant-Registrierung wurde leider abgelehnt.",
      !approved && input.note ? `Hinweis: ${input.note}` : "",
      "",
      "Viele Grüße",
      "Nah&Fein"
    ]
      .filter(Boolean)
      .join("\n");

    await this.sendMail(input.restaurantEmail, subject, text);
  }

  async sendRestaurantSupportRequest(input: RestaurantSupportRequestInput): Promise<void> {
    const subject = "Nah&Fein: Support-Anfrage aus Gastro-Dashboard";
    const text = [
      "Neue Support-Anfrage aus dem Gastro-Bereich.",
      "",
      `Restaurant: ${input.restaurantName}`,
      `E-Mail: ${input.restaurantEmail}`,
      `Telefon: ${input.phone}`,
      input.source ? `Bereich: ${input.source}` : "",
      "",
      "Nachricht:",
      input.message.trim()
    ]
      .filter(Boolean)
      .join("\n");

    await this.sendMail(this.registrationNotifyEmail, subject, text);
  }

  async sendRestaurantReviewReceived(input: RestaurantReviewReceivedInput): Promise<void> {
    const dashboardUrl = input.dashboardUrl?.trim() || this.appPublicUrl;
    const author = input.authorName?.trim() || "Gast";
    const subject = "Nah&Fein: Neue Bewertung eingegangen";
    const text = [
      `Hallo ${input.restaurantName},`,
      "",
      "du hast eine neue öffentliche Bewertung erhalten.",
      "",
      `Bewertung: ${input.rating} von 5 Sternen`,
      `Von: ${author}`,
      `Text: ${truncateText(input.text, 500)}`,
      "",
      "Du kannst die Bewertung im Restaurant-Dashboard lesen und öffentlich beantworten:",
      dashboardUrl,
      "",
      "Viele Grüße",
      "Nah&Fein"
    ].join("\n");

    await this.sendMail(input.restaurantEmail, subject, text);
  }

  async sendRestaurantReviewReportNotifyAdmin(
    input: RestaurantReviewReportNotifyAdminInput
  ): Promise<void> {
    const author = input.authorName?.trim() || "Gast";
    const subject = `Nah&Fein: Bewertung von ${input.restaurantName} gemeldet`;
    const text = [
      "Eine Bewertung wurde durch einen Restaurantpartner gemeldet.",
      "",
      `Restaurant: ${input.restaurantName}`,
      `Restaurant-E-Mail: ${input.restaurantEmail}`,
      `Bewertung: ${input.rating} von 5 Sternen`,
      `Von: ${author}`,
      `Meldegrund: ${input.reasonLabel}`,
      input.note?.trim() ? `Hinweis: ${truncateText(input.note, 1000)}` : "",
      `Bewertungstext: ${truncateText(input.text, 1000)}`,
      `Bewertungs-ID: ${input.reviewId}`,
      "",
      "Bitte im Admin-Bereich prüfen:",
      `${this.adminPublicUrl}/#review-reports`
    ]
      .filter(Boolean)
      .join("\n");

    await this.sendMail(this.reviewReportNotifyEmail, subject, text);
  }

  async sendRestaurantReviewReportResolved(
    input: RestaurantReviewReportResolvedInput
  ): Promise<void> {
    const decisionText =
      input.decision === "removed"
        ? "Die gemeldete Bewertung wurde von Nah&Fein entfernt und ist nicht mehr öffentlich sichtbar."
        : input.decision === "restored"
        ? "Die Bewertung wurde wiederhergestellt und ist wieder öffentlich sichtbar."
        : "Die Bewertung wurde geprüft und bleibt öffentlich sichtbar.";
    const subject = "Nah&Fein: Entscheidung zu deiner gemeldeten Bewertung";
    const text = [
      `Hallo ${input.restaurantName},`,
      "",
      decisionText,
      `Bewertung: ${input.rating} von 5 Sternen`,
      input.resolutionNote?.trim()
        ? `Begründung: ${truncateText(input.resolutionNote, 1000)}`
        : "",
      "",
      "Den aktuellen Status findest du in deinem Dashboard unter Bewertungen:",
      this.appPublicUrl,
      "",
      "Viele Grüße",
      "Nah&Fein"
    ]
      .filter(Boolean)
      .join("\n");

    await this.sendMail(input.restaurantEmail, subject, text);
  }

  async sendRestaurantPasswordResetCode(
    input: RestaurantPasswordResetCodeInput
  ): Promise<void> {
    const expiresAt = formatDateTimeDe(input.expiresAtIso);
    const subject = "Nah&Fein: Passwort zurücksetzen";
    const text = [
      `Hallo ${input.restaurantName},`,
      "",
      "du hast einen Code zum Zurücksetzen deines Gastro-Passworts angefordert.",
      "",
      `Code: ${input.code}`,
      `Gültig bis: ${expiresAt}`,
      "",
      "Wenn du das nicht warst, kannst du diese E-Mail ignorieren.",
      "",
      "Viele Grüße",
      "Nah&Fein"
    ].join("\n");

    await this.sendMail(input.restaurantEmail, subject, text);
  }

  private async sendMail(to: string, subject: string, text: string): Promise<void> {
    if (!this.transporter || !this.fromEmail) return;
    const recipient = normalizeEmail(to);
    if (!recipient) return;

    await this.transporter.sendMail({
      from: this.fromEmail,
      to: recipient,
      subject,
      text
    });
  }
}
