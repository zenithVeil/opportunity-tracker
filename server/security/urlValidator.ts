import { URL } from 'url';
import dns from 'dns/promises';
import net from 'net';

/**
 * Checks if an IPv4 address is in a private, loopback, link-local, or reserved range.
 */
function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split('.').map((p) => parseInt(p, 10));
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    return true; // Malformed IPv4 is unsafe
  }

  const [a, b] = parts;

  // 0.0.0.0/8 (current network)
  if (a === 0) return true;

  // 127.0.0.0/8 (loopback)
  if (a === 127) return true;

  // 10.0.0.0/8 (private)
  if (a === 10) return true;

  // 172.16.0.0/12 (private: 172.16.x.x - 172.31.x.x)
  if (a === 172 && b >= 16 && b <= 31) return true;

  // 192.168.0.0/16 (private)
  if (a === 192 && b === 168) return true;

  // 169.254.0.0/16 (link-local, cloud instance metadata e.g. 169.254.169.254)
  if (a === 169 && b === 254) return true;

  // 100.64.0.0/10 (carrier-grade NAT)
  if (a === 100 && b >= 64 && b <= 127) return true;

  // 224.0.0.0/4 (multicast) & 240.0.0.0/4 (reserved)
  if (a >= 224) return true;

  return false;
}

/**
 * Checks if an IPv6 address is in a private, loopback, link-local, or reserved range.
 */
function isPrivateIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === '::1' || normalized === '::') return true;
  // Link-local: fe80::/10
  if (normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb')) {
    return true;
  }
  // Unique local: fc00::/7 (fc00:: and fd00::)
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) {
    return true;
  }
  // IPv4-mapped IPv6: ::ffff:127.0.0.1
  if (normalized.includes('::ffff:')) {
    const v4 = normalized.split('::ffff:')[1];
    if (v4 && net.isIPv4(v4)) {
      return isPrivateIpv4(v4);
    }
  }
  return false;
}

/**
 * Validates that a target URL uses http/https, has a valid public domain/IP,
 * and does NOT resolve to internal, loopback, or cloud metadata endpoints.
 */
export async function isSafePublicUrl(urlStr: string): Promise<boolean> {
  if (!urlStr || typeof urlStr !== 'string') return false;

  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    return false;
  }

  // Only allow http and https protocols
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return false;
  }

  let hostname = parsed.hostname.toLowerCase();
  // Strip bracket notation from IPv6
  if (hostname.startsWith('[') && hostname.endsWith(']')) {
    hostname = hostname.slice(1, -1);
  }

  if (!hostname || hostname === 'localhost' || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
    return false;
  }

  // If hostname is directly an IP address
  if (net.isIPv4(hostname)) {
    return !isPrivateIpv4(hostname);
  }
  if (net.isIPv6(hostname)) {
    return !isPrivateIpv6(hostname);
  }

  // DNS lookup to prevent DNS rebinding attacks to loopback or private networks
  try {
    const records = await dns.lookup(hostname, { all: true });
    if (!records || records.length === 0) return false;

    for (const record of records) {
      if (record.family === 4 && isPrivateIpv4(record.address)) {
        return false;
      }
      if (record.family === 6 && isPrivateIpv6(record.address)) {
        return false;
      }
    }
    return true;
  } catch {
    // DNS resolution failure (domain does not exist or network unavailable)
    return false;
  }
}
