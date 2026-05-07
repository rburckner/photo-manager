import { Server as SSDPServer } from 'node-ssdp';
import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { join } from 'node:path';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { PhotoRepository } from '../db/repositories/photo.repository.js';
import { AlbumRepository } from '../db/repositories/album.repository.js';
import type { AppConfig } from '../shared/types.js';
import { getLogger } from '../shared/logger.js';

const DLNA_PORT = 8200;
const USN = 'uuid:photo-manager-dlna-1';

function getLocalIp(): string {
  const interfaces = networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    const iface = interfaces[name];
    if (!iface) continue;
    for (const info of iface) {
      if (info.family === 'IPv4' && !info.internal) {
        return info.address;
      }
    }
  }
  return '127.0.0.1';
}

export interface DlnaHandle {
  stop: () => void;
  running: boolean;
}

let dlnaHandle: DlnaHandle | null = null;

export function getDlnaStatus(): { running: boolean } {
  return { running: dlnaHandle?.running ?? false };
}

export function stopDlnaServer(): void {
  if (dlnaHandle) {
    dlnaHandle.stop();
    dlnaHandle = null;
  }
}

export function startDlnaServer(
  photoRepo: PhotoRepository,
  albumRepo: AlbumRepository,
  config: AppConfig,
): void {
  if (dlnaHandle?.running) return;

  const log = getLogger();
  const localIp = getLocalIp();
  const baseUrl = `http://${localIp}:${DLNA_PORT}`;

  // SSDP advertisement — lets TVs discover us
  const ssdp = new SSDPServer({
    location: `${baseUrl}/description.xml`,
  });

  ssdp.addUSN('upnp:rootdevice');
  ssdp.addUSN('urn:schemas-upnp-org:device:MediaServer:1');
  ssdp.addUSN('urn:schemas-upnp-org:service:ContentDirectory:1');

  // HTTP server for DLNA content
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = req.url ?? '/';

    if (url === '/description.xml') {
      serveDescription(res, baseUrl);
    } else if (url.startsWith('/content/')) {
      serveContent(req, res, url, photoRepo, config);
    } else if (url === '/contentDirectory' && req.method === 'POST') {
      handleContentDirectory(req, res, photoRepo, albumRepo, baseUrl);
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  server.listen(DLNA_PORT, '0.0.0.0', () => {
    log.info({ port: DLNA_PORT, ip: localIp }, 'DLNA server started');
    void ssdp.start();
    log.info('SSDP advertisement started — TV should discover "Photo Manager"');
  });

  dlnaHandle = {
    running: true,
    stop: () => {
      ssdp.stop();
      server.close();
      dlnaHandle = { running: false, stop: () => {} };
      log.info('DLNA server stopped');
    },
  };
}

function serveDescription(res: ServerResponse, baseUrl: string): void {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<root xmlns="urn:schemas-upnp-org:device-1-0">
  <specVersion><major>1</major><minor>0</minor></specVersion>
  <device>
    <deviceType>urn:schemas-upnp-org:device:MediaServer:1</deviceType>
    <friendlyName>Photo Manager</friendlyName>
    <manufacturer>Photo Manager</manufacturer>
    <modelName>Photo Manager DLNA</modelName>
    <modelNumber>1.0</modelNumber>
    <UDN>${USN}</UDN>
    <serviceList>
      <service>
        <serviceType>urn:schemas-upnp-org:service:ContentDirectory:1</serviceType>
        <serviceId>urn:upnp-org:serviceId:ContentDirectory</serviceId>
        <controlURL>${baseUrl}/contentDirectory</controlURL>
        <eventSubURL></eventSubURL>
        <SCPDURL>${baseUrl}/contentDirectory/scpd.xml</SCPDURL>
      </service>
    </serviceList>
  </device>
</root>`;

  res.writeHead(200, {
    'Content-Type': 'text/xml; charset="utf-8"',
    'Content-Length': Buffer.byteLength(xml),
  });
  res.end(xml);
}

function serveContent(
  _req: IncomingMessage,
  res: ServerResponse,
  url: string,
  photoRepo: PhotoRepository,
  config: AppConfig,
): void {
  // /content/photo/<id> — serve original photo
  // /content/thumb/<id> — serve thumbnail
  const parts = url.split('/');
  const type = parts[2]; // 'photo' or 'thumb'
  const id = parseInt(parts[3] ?? '0', 10);

  const photo = photoRepo.findById(id);
  if (!photo) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  let filePath: string;
  let contentType: string;

  if (type === 'thumb' && photo.thumbnail_path) {
    filePath = join(config.thumbnailDir, photo.thumbnail_path);
    contentType = 'image/jpeg';
  } else {
    filePath = join(config.mediaRoot, photo.file_path);
    contentType = photo.mime_type;
  }

  if (!existsSync(filePath)) {
    res.writeHead(404);
    res.end('File not found');
    return;
  }

  const stat = statSync(filePath);
  res.writeHead(200, {
    'Content-Type': contentType,
    'Content-Length': stat.size,
    'transferMode.dlna.org': 'Streaming',
    'contentFeatures.dlna.org': 'DLNA.ORG_OP=01;DLNA.ORG_FLAGS=01700000000000000000000000000000',
  });
  createReadStream(filePath).pipe(res);
}

function handleContentDirectory(
  req: IncomingMessage,
  res: ServerResponse,
  photoRepo: PhotoRepository,
  albumRepo: AlbumRepository,
  baseUrl: string,
): void {
  let body = '';
  req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
  req.on('end', () => {
    // Parse the SOAP action
    const action = req.headers.soapaction ?? '';

    if (action.includes('Browse')) {
      const objectId = extractTag(body, 'ObjectID') ?? '0';
      const startIndex = parseInt(extractTag(body, 'StartingIndex') ?? '0', 10);
      const requestCount = parseInt(extractTag(body, 'RequestedCount') ?? '50', 10);

      const result = browseContent(objectId, startIndex, requestCount, photoRepo, albumRepo, baseUrl);
      sendSoapResponse(res, 'Browse', result);
    } else if (action.includes('GetSystemUpdateID')) {
      sendSoapResponse(res, 'GetSystemUpdateID', '<Id>1</Id>');
    } else if (action.includes('GetSearchCapabilities')) {
      sendSoapResponse(res, 'GetSearchCapabilities', '<SearchCaps></SearchCaps>');
    } else if (action.includes('GetSortCapabilities')) {
      sendSoapResponse(res, 'GetSortCapabilities', '<SortCaps></SortCaps>');
    } else {
      res.writeHead(500);
      res.end('Unknown action');
    }
  });
}

function browseContent(
  objectId: string,
  startIndex: number,
  requestCount: number,
  photoRepo: PhotoRepository,
  albumRepo: AlbumRepository,
  baseUrl: string,
): string {
  const limit = Math.min(requestCount || 50, 200);

  if (objectId === '0') {
    // Root — show "All Photos", "Albums", "Timeline"
    const didl = `<DIDL-Lite xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/"
      xmlns:dc="http://purl.org/dc/elements/1.1/"
      xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/">
      <container id="all" parentID="0" restricted="1" childCount="${photoRepo.countAll()}">
        <dc:title>All Photos</dc:title>
        <upnp:class>object.container</upnp:class>
      </container>
      <container id="albums" parentID="0" restricted="1">
        <dc:title>Albums</dc:title>
        <upnp:class>object.container</upnp:class>
      </container>
    </DIDL-Lite>`;
    return wrapBrowseResult(didl, 2, 2);
  }

  if (objectId === 'all') {
    // All photos
    const { photos, total } = photoRepo.list({ limit, offset: startIndex });
    const items = photos.map((p) => photoToDidl(p.id, p.mime_type, p.date_taken, 'all', baseUrl)).join('');
    const didl = `<DIDL-Lite xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/"
      xmlns:dc="http://purl.org/dc/elements/1.1/"
      xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/">${items}</DIDL-Lite>`;
    return wrapBrowseResult(didl, photos.length, total);
  }

  if (objectId === 'albums') {
    // List albums
    const albums = albumRepo.list();
    const items = albums.map((a) => `
      <container id="album_${a.id}" parentID="albums" restricted="1" childCount="${a.photo_count}">
        <dc:title>${escapeXml(a.name)}</dc:title>
        <upnp:class>object.container.album.photoAlbum</upnp:class>
      </container>
    `).join('');
    const didl = `<DIDL-Lite xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/"
      xmlns:dc="http://purl.org/dc/elements/1.1/"
      xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/">${items}</DIDL-Lite>`;
    return wrapBrowseResult(didl, albums.length, albums.length);
  }

  if (objectId.startsWith('album_')) {
    // Album photos
    const albumId = parseInt(objectId.replace('album_', ''), 10);
    const { photos, total } = albumRepo.getPhotos(albumId, limit, startIndex);
    const items = photos.map((p) => photoToDidl(p.id, p.mime_type, p.date_taken, objectId, baseUrl)).join('');
    const didl = `<DIDL-Lite xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/"
      xmlns:dc="http://purl.org/dc/elements/1.1/"
      xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/">${items}</DIDL-Lite>`;
    return wrapBrowseResult(didl, photos.length, total);
  }

  // Unknown container
  return wrapBrowseResult('<DIDL-Lite xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/"></DIDL-Lite>', 0, 0);
}

function photoToDidl(id: number, mimeType: string, dateTaken: string | null, parentId: string, baseUrl: string): string {
  const photoUrl = `${baseUrl}/content/photo/${id}`;
  const thumbUrl = `${baseUrl}/content/thumb/${id}`;
  const date = dateTaken ? dateTaken.slice(0, 10) : '';

  return `
    <item id="photo_${id}" parentID="${parentId}" restricted="1">
      <dc:title>Photo ${id}</dc:title>
      ${date ? `<dc:date>${date}</dc:date>` : ''}
      <upnp:class>object.item.imageItem.photo</upnp:class>
      <upnp:albumArtURI>${thumbUrl}</upnp:albumArtURI>
      <res protocolInfo="http-get:*:${mimeType}:*">${photoUrl}</res>
    </item>`;
}

function wrapBrowseResult(didl: string, numberReturned: number, totalMatches: number): string {
  return `<Result>${escapeXml(didl)}</Result>
    <NumberReturned>${numberReturned}</NumberReturned>
    <TotalMatches>${totalMatches}</TotalMatches>
    <UpdateID>1</UpdateID>`;
}

function sendSoapResponse(res: ServerResponse, action: string, body: string): void {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
  <s:Body>
    <u:${action}Response xmlns:u="urn:schemas-upnp-org:service:ContentDirectory:1">
      ${body}
    </u:${action}Response>
  </s:Body>
</s:Envelope>`;

  res.writeHead(200, {
    'Content-Type': 'text/xml; charset="utf-8"',
    'Content-Length': Buffer.byteLength(xml),
    'EXT': '',
  });
  res.end(xml);
}

function extractTag(xml: string, tag: string): string | null {
  const regex = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`);
  const match = regex.exec(xml);
  return match?.[1] ?? null;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
