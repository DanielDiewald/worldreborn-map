import { isIP } from "node:net";

const BLOCKED_HOST_SUFFIXES = [".localhost", ".local", ".internal", ".lan", ".home.arpa"] as const;

function ipv4Number(address: string) {
  const parts = address.split(".");
  if (parts.length !== 4) return null;
  const values = parts.map((part) => Number(part));
  if (values.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) return null;
  return (((values[0] * 256 + values[1]) * 256 + values[2]) * 256 + values[3]) >>> 0;
}

function ipv4InCidr(address: number, base: number, bits: number) {
  if (bits === 0) return true;
  const mask = (0xffffffff << (32 - bits)) >>> 0;
  return (address & mask) === (base & mask);
}

function isPublicIpv4(address: string) {
  const value = ipv4Number(address);
  if (value == null) return false;
  const blocked: Array<[string, number]> = [
    ["0.0.0.0", 8],
    ["10.0.0.0", 8],
    ["100.64.0.0", 10],
    ["127.0.0.0", 8],
    ["169.254.0.0", 16],
    ["172.16.0.0", 12],
    ["192.0.0.0", 24],
    ["192.0.2.0", 24],
    ["192.168.0.0", 16],
    ["198.18.0.0", 15],
    ["198.51.100.0", 24],
    ["203.0.113.0", 24],
    ["224.0.0.0", 4],
    ["240.0.0.0", 4],
  ];
  return !blocked.some(([base, bits]) => ipv4InCidr(value, ipv4Number(base)!, bits));
}

function ipv6Number(address: string) {
  let input = address.toLowerCase().split("%")[0];
  if (input.includes(".")) {
    const lastColon = input.lastIndexOf(":");
    const mapped = ipv4Number(input.slice(lastColon + 1));
    if (mapped == null) return null;
    input = `${input.slice(0, lastColon)}:${((mapped >>> 16) & 0xffff).toString(16)}:${(mapped & 0xffff).toString(16)}`;
  }
  const halves = input.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - tail.length;
  if (missing < 0 || (halves.length === 1 && missing !== 0)) return null;
  const parts = [...head, ...Array(missing).fill("0"), ...tail];
  if (parts.length !== 8) return null;
  let value = 0n;
  for (const part of parts) {
    if (!/^[0-9a-f]{1,4}$/.test(part)) return null;
    value = (value << 16n) | BigInt(Number.parseInt(part, 16));
  }
  return value;
}

function ipv6InCidr(address: bigint, base: bigint, bits: number) {
  if (bits === 0) return true;
  const shift = 128n - BigInt(bits);
  return (address >> shift) === (base >> shift);
}

function isPublicIpv6(address: string) {
  const value = ipv6Number(address);
  if (value == null) return false;
  if (value === 0n || value === 1n) return false;

  const mappedPrefix = 0xffffn;
  if ((value >> 32n) === mappedPrefix) {
    const mapped = Number(value & 0xffffffffn) >>> 0;
    const dotted = `${mapped >>> 24}.${(mapped >>> 16) & 255}.${(mapped >>> 8) & 255}.${mapped & 255}`;
    return isPublicIpv4(dotted);
  }

  const blocked: Array<[string, number]> = [
    ["100::", 64],
    ["64:ff9b::", 96],
    ["2001:2::", 48],
    ["2001:db8::", 32],
    ["fc00::", 7],
    ["fe80::", 10],
    ["ff00::", 8],
  ];
  return !blocked.some(([base, bits]) => ipv6InCidr(value, ipv6Number(base)!, bits));
}

export function isPublicRemoteAddress(address: string) {
  const normalized = address.replace(/^\[|\]$/g, "");
  const family = isIP(normalized);
  if (family === 4) return isPublicIpv4(normalized);
  if (family === 6) return isPublicIpv6(normalized);
  return false;
}

export function parseRemoteImageUrl(value: string) {
  const input = value.trim();
  const normalized = input.startsWith("//") ? `https:${input}` : input;
  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    throw new Error("Die Bild-URL ist ungültig.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Bild-URLs müssen HTTP oder HTTPS verwenden.");
  if (url.username || url.password) throw new Error("Bild-URLs mit Zugangsdaten werden nicht unterstützt.");
  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!hostname || hostname === "localhost" || BLOCKED_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))) {
    throw new Error("Diese Bild-URL verweist auf einen nicht erlaubten Host.");
  }
  if (isIP(hostname) && !isPublicRemoteAddress(hostname)) throw new Error("Private oder lokale Bild-Adressen sind nicht erlaubt.");
  url.hash = "";
  return url;
}
