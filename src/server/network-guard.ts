import type { FastifyReply, FastifyRequest } from 'fastify';

export function isPrivateIp(ip: string): boolean {
  const addr = ip.replace(/^::ffff:/, '');
  if (addr === '127.0.0.1' || addr === '::1' || addr === 'localhost') return true;
  if (addr.startsWith('10.')) return true;
  if (addr.startsWith('192.168.')) return true;
  if (addr.startsWith('172.')) {
    const second = parseInt(addr.split('.')[1] ?? '0', 10);
    if (second >= 16 && second <= 31) return true;
  }
  return false;
}

/**
 * preHandler that rejects any request from a non-private IP, ignoring PM_ALLOW_REMOTE.
 * Use on destructive endpoints (delete, purge, empty trash) so remote/Tailscale users
 * can browse but not destroy.
 */
export async function requireLocalNetwork(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  if (!isPrivateIp(request.ip)) {
    return reply.code(403).send({ error: 'Local network only' });
  }
}
