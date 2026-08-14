import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const MAX_EXTERNAL_URL_LENGTH = 2_048;
const MAX_EXTRACTED_TEXT_LENGTH = 200_000;

function isPrivateIpv4(address: string) {
  const octets = address.split(".").map(Number);
  const [a, b] = octets;
  return a === 10 || a === 127 || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
    a === 0;
}

function isPrivateIpv6(address: string) {
  const normalized = address.toLowerCase();
  return normalized === "::1" || normalized === "::" ||
    normalized.startsWith("fc") || normalized.startsWith("fd") ||
    normalized.startsWith("fe8") || normalized.startsWith("fe9") ||
    normalized.startsWith("fea") || normalized.startsWith("feb");
}

function isPrivateAddress(address: string) {
  return isIP(address) === 4 ? isPrivateIpv4(address) : isPrivateIpv6(address);
}

export async function assertSafeExternalUrl(rawUrl: string) {
  if (typeof rawUrl !== "string" || rawUrl.length === 0 || rawUrl.length > MAX_EXTERNAL_URL_LENGTH) {
    throw new Error("URL inválida ou acima do limite permitido");
  }

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("URL inválida");
  }

  if (!(["http:", "https:"].includes(url.protocol)) || url.username || url.password || url.port) {
    throw new Error("A URL deve usar HTTP/HTTPS sem credenciais ou porta explícita");
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (["localhost", "localhost.localdomain", "metadata.google.internal"].includes(hostname) || hostname.endsWith(".localhost")) {
    throw new Error("Destino local não permitido");
  }

  const addresses = await lookup(hostname, { all: true });
  if (addresses.length === 0 || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error("Destino privado ou não resolvido não permitido");
  }

  return url;
}

export function capExtractedText(text: string) {
  return text.length > MAX_EXTRACTED_TEXT_LENGTH
    ? `${text.slice(0, MAX_EXTRACTED_TEXT_LENGTH)}\n[texto truncado]`
    : text;
}