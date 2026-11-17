import { ParaclinicalRoom } from '../types/hospital';

export interface ResolvedRoomDisplay {
  code: string;
  name: string;
  fullLabel: string;
  matchedRoom?: ParaclinicalRoom;
}

export const formatRoomStorageValue = (
  room: Pick<ParaclinicalRoom, 'code' | 'name'>
): string => {
  const code = (room.code || '').trim();
  const name = (room.name || '').trim();
  if (code && name) return `${code} - ${name}`;
  return name || code;
};

export const isEquipmentInRoom = (
  equipmentRoom: string | undefined,
  room: Pick<ParaclinicalRoom, 'code' | 'name'>
): boolean => {
  const raw = (equipmentRoom || '').trim();
  if (!raw) return false;
  const rawLower = raw.toLowerCase();
  const codeLower = (room.code || '').trim().toLowerCase();
  const nameLower = (room.name || '').trim().toLowerCase();

  if (nameLower && rawLower === nameLower) return true;
  if (codeLower && nameLower) {
    if (
      rawLower === `${codeLower} - ${nameLower}` ||
      rawLower === `${codeLower} · ${nameLower}` ||
      rawLower === `${nameLower} (${codeLower})` ||
      rawLower.startsWith(`${codeLower} - `) ||
      rawLower.startsWith(`${codeLower} · `)
    ) {
      return true;
    }
  }
  if (codeLower && (rawLower === codeLower || rawLower.includes(`(${codeLower})`))) {
    return true;
  }
  return false;
};

export const resolveRoomDisplay = (
  roomValue: string | undefined,
  roomsList: ParaclinicalRoom[]
): ResolvedRoomDisplay => {
  const raw = (roomValue || '').trim();
  if (
    !raw ||
    raw === 'Chưa phân phòng' ||
    raw === 'Kho thiết bị / Chưa phân phòng'
  ) {
    return {
      code: '',
      name: raw || 'Chưa phân phòng',
      fullLabel: raw || 'Chưa phân phòng'
    };
  }

  const rawLower = raw.toLowerCase();

  // 1. Exact code or combined "CODE - NAME" match
  const matchedByCodeOrCombined = roomsList.find((r) => {
    const c = (r.code || '').trim();
    const n = (r.name || '').trim();
    const combinedDash = c ? `${c} - ${n}`.toLowerCase() : n.toLowerCase();
    const combinedDot = c ? `${c} · ${n}`.toLowerCase() : n.toLowerCase();
    const combinedParen = c ? `${n} (${c})`.toLowerCase() : n.toLowerCase();
    return (
      rawLower === combinedDash ||
      rawLower === combinedDot ||
      rawLower === combinedParen ||
      (c !== '' && rawLower === c.toLowerCase()) ||
      (c !== '' && rawLower.startsWith(`${c.toLowerCase()} - `)) ||
      (c !== '' && rawLower.startsWith(`${c.toLowerCase()} · `))
    );
  });

  if (matchedByCodeOrCombined) {
    const code = (matchedByCodeOrCombined.code || '').trim();
    const name = (matchedByCodeOrCombined.name || '').trim();
    return {
      code,
      name,
      fullLabel: formatRoomStorageValue(matchedByCodeOrCombined),
      matchedRoom: matchedByCodeOrCombined
    };
  }

  // 2. Match by exact room name (only auto-attach code if unambiguous or single match)
  const nameMatches = roomsList.filter(
    (r) => (r.name || '').trim().toLowerCase() === rawLower
  );
  if (nameMatches.length === 1) {
    const matched = nameMatches[0];
    return {
      code: (matched.code || '').trim(),
      name: (matched.name || '').trim(),
      fullLabel: formatRoomStorageValue(matched),
      matchedRoom: matched
    };
  }

  // 3. Parse "CODE - Name" format directly if present in string
  const prefixMatch = raw.match(/^([A-Za-z0-9._-]+)\s*[-–·•]\s*(.+)$/);
  if (prefixMatch) {
    return {
      code: prefixMatch[1].trim(),
      name: prefixMatch[2].trim(),
      fullLabel: `${prefixMatch[1].trim()} - ${prefixMatch[2].trim()}`
    };
  }

  return {
    code: '',
    name: raw,
    fullLabel: raw
  };
};
