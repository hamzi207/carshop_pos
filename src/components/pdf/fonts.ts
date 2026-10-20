// PDF font stacks (RF-16.2). Latin text stays in the built-in Helvetica; Urdu / Arabic-script characters
// fall back to Noto Sans Arabic (src/assets/fonts, SIL OFL), which react-pdf shapes and orders right to
// left. The Noto families are registered in src/lib/pdf.tsx before anything is rendered.
export const FONT = ["Helvetica", "NotoSansArabic"];
export const FONT_BOLD = ["Helvetica-Bold", "NotoSansArabic-Bold"];
