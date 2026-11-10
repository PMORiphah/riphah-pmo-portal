/* Mail bodies pass through denomailer 1.6.0, whose quoted-printable encoder
   turns a space at the end of a line into "=20" and then escapes that "=" again
   ("=3d20"), so readers saw a literal "=20" after "Respected Sir," and similar
   lines (PMO, 10 Nov 2026). Every text and HTML body goes through mailSafe()
   before sending: Windows/Mac line breaks become \n and spaces or tabs before a
   line break are dropped. Nothing visible changes in the message. */
export const mailSafe = (s: unknown): string => String(s ?? "")
  .replace(/\r\n?/g, "\n")
  .replace(/[ \t]+\n/g, "\n")
  .replace(/[ \t]+$/, "");
