import assert from "node:assert/strict";
import test from "node:test";
import { resolveDiscoveredWebsiteUrl } from "./websiteSyncService";

test("resolves indented multiline menu URLs from HTML attributes", () => {
  const source = `
    /fileadmin/speisenkarten/speisekarte_juli_-_sept_26_final.pdf
  `;

  assert.equal(
    resolveDiscoveredWebsiteUrl(source, "https://www.example.org/restaurant/menu.html"),
    "https://www.example.org/fileadmin/speisenkarten/speisekarte_juli_-_sept_26_final.pdf"
  );
});

test("decodes entities without removing valid spaces inside a URL", () => {
  assert.equal(
    resolveDiscoveredWebsiteUrl(
      "  /menus/Sommer Karte.pdf?language=de&amp;download=1  ",
      "https://www.example.org/restaurant/"
    ),
    "https://www.example.org/menus/Sommer%20Karte.pdf?language=de&download=1"
  );
});
