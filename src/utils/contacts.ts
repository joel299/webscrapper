const emailRegex = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const phoneRegex = /\b\d{10,11}\b/g;

export function extractContacts(text: string) {
  return {
    email: text.match(emailRegex) ?? [],
    telefone: text.match(phoneRegex) ?? [],
    celular: text.match(phoneRegex) ?? []
  };
}
