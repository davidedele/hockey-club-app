// A link that opens WhatsApp with the text ready to send; the person picks the chat.
export const whatsappLink = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`
