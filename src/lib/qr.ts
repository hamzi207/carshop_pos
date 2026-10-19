import QRCode from "qrcode";

/**
 * A QR code as one SVG path in module units (crisp on 203 dpi print heads), with a
 * 2-module quiet zone: draw it in a `0 0 size size` viewBox. Used by the 80mm POS
 * slip, both the PDF and the version printed from the screen.
 */
export function qrPath(text: string) {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: "M" });
  let d = "";
  for (let r = 0; r < modules.size; r++) {
    for (let c = 0; c < modules.size; c++) {
      if (modules.get(r, c)) d += `M${c + 2} ${r + 2}h1v1h-1z`;
    }
  }
  return { size: modules.size + 4, d };
}
