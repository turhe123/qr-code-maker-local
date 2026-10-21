# Static QR Code Maker — specification

**Tagline:** Make QR codes for links, Wi-Fi, text and contacts in your browser, saved as PNG or SVG that never expire.

**Category:** Generators & Calculators

**Free alternative to:** QR Code Generator Pro and QR Code Monkey (dynamic QR codes expire unless you pay a monthly subscription, sign-up required, trial codes stop working, tracking redirects)

**Search phrases:** qr code generator, free qr code generator no sign up, wifi qr code generator, qr code for url, qr code svg, qr code that never expires, vcard qr code

**Allowed libraries:** qrcode-generator

**Published at:** https://turhe123.github.io/qr-code-maker-local/

## Acceptance checks (each must have a test)

- entering a link to the example menu page produces a visible QR code on a canvas
- switching to Wi-Fi type and filling SSID and password changes the code
- Download PNG yields a file larger than 500 bytes
- Download SVG yields a file starting with an svg element
- changing error correction to High updates the code
- works at 390px wide

## Spec

Search demand: qr code generator is one of the biggest utility queries on the web, with many variants such as wifi qr code, qr code for url and qr code free no sign up. The leading sites, including QR Code Generator Pro and others, lure people with free dynamic codes that route through the company's redirect server and then stop working after a trial ends unless a monthly plan is bought, which is a notorious complaint with printed menus and flyers. Others add watermarks, require an account to download high resolution files, or track scans.

Our version does one job: create static QR codes that encode the data directly, so they work forever, with no redirect and no tracking. Content types: URL, plain text, email, phone number, SMS, Wi-Fi network (SSID, password, security type, hidden flag), and contact card (name, phone, email, organisation). Options: error correction level (Low, Medium, Quartile, High, default Medium), size in pixels, quiet zone margin, foreground and background colours with a contrast warning when scanning might fail, and module style of square. Outputs: PNG at chosen size and a scalable SVG, plus a copy image button.

UI: a type selector as a row of buttons above the fold, a dynamic form below it showing the fields for that type, and a live QR preview that updates as the user types. Under the preview are the Download PNG and Download SVG buttons, named qr-code.png and qr-code.svg, or using the type name such as wifi-qr.png. A small readout shows the number of characters and the QR version and warns when the content is too long for the chosen error correction. Empty state shows a sample URL. Error state appears when the text is empty or too long. Keyboard: all fields are tab reachable and the preview updates without pressing a button.

Technical approach: use the allowed qrcode-generator library to compute the module matrix for the chosen type number and error correction, then draw it to a canvas by filling rectangles at integer pixel sizes so edges are crisp, and scale with imageSmoothing disabled. Build the SVG by emitting one path made from merged horizontal runs of dark modules, which keeps the file small. Wi-Fi payload follows the common WIFI colon format with escaping for special characters contact payload follows the vCard 3 format with escaped commas and semicolons SMS and phone use the standard schemes. Encode text as UTF-8 so non-Latin characters work. Download PNG through canvas toBlob and SVG through a Blob, both with revocable object URLs. Contrast check computes luminance ratio and warns under 3 to 1 or when the foreground is lighter than the background.

Edge cases: the maximum capacity is about 2,900 bytes at low correction, show a clear overflow message very small sizes below 128 pixels warn that scanning is hard high-DPI screens use devicePixelRatio for crisp preview mobile Safari needs a long press to save the image, so also show the PNG as an image element Unicode emoji work through UTF-8 conversion no logo embedding is offered to keep the tool focused and scannable.

Demo data: a fictional cafe called Lantern Bean with the link to its menu page on example dot org, a guest Wi-Fi network called LanternGuest with a made up password, and a contact card for a fictional owner named Ada Brook.
