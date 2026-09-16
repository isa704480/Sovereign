"use client";

/** Client mirror of the server-side image-intent detector. */
export function detectImageIntent(text: string): boolean {
  return /\b(rasm chiz|rasm yarat|logo chiz|logo yarat|sur[ao]t|image|picture|draw|generate.*image|make.*image|illustration|design.*logo|chizib ber)\b/i.test(
    text,
  );
}
