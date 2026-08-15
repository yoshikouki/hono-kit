const TOKEN_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const QVALUE_PATTERN = /^(?:0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/;

interface MediaType {
  parameters: ReadonlyMap<string, string>;
  subtype: string;
  type: string;
}

interface MediaRange extends MediaType {
  quality: number;
}

function splitOutsideQuotes(
  value: string,
  delimiter: string
): string[] | undefined {
  const parts: string[] = [];
  let escaped = false;
  let quoted = false;
  let start = 0;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (quoted && character === "\\") {
      escaped = true;
      continue;
    }
    if (character === '"') {
      quoted = !quoted;
      continue;
    }
    if (!quoted && character === delimiter) {
      parts.push(value.slice(start, index));
      start = index + 1;
    }
  }

  if (quoted || escaped) {
    return;
  }
  parts.push(value.slice(start));
  return parts;
}

function parseParameterValue(value: string): string | undefined {
  const trimmedValue = value.trim();
  if (TOKEN_PATTERN.test(trimmedValue)) {
    return trimmedValue;
  }
  if (!(trimmedValue.startsWith('"') && trimmedValue.endsWith('"'))) {
    return;
  }

  let parsedValue = "";
  for (let index = 1; index < trimmedValue.length - 1; index += 1) {
    const character = trimmedValue[index];
    if (character === "\\") {
      index += 1;
      const escapedCharacter = trimmedValue[index];
      if (escapedCharacter === undefined || index === trimmedValue.length - 1) {
        return;
      }
      parsedValue += escapedCharacter;
      continue;
    }
    if (character === '"') {
      return;
    }
    parsedValue += character;
  }
  return parsedValue;
}

function parseMediaRange(value: string): MediaRange | undefined {
  const segments = splitOutsideQuotes(value, ";");
  if (!segments) {
    return;
  }

  const mediaType = segments[0]?.trim().toLowerCase();
  if (!mediaType) {
    return;
  }
  const slashIndex = mediaType.indexOf("/");
  if (slashIndex <= 0 || slashIndex !== mediaType.lastIndexOf("/")) {
    return;
  }

  const type = mediaType.slice(0, slashIndex);
  const subtype = mediaType.slice(slashIndex + 1);
  const validWildcard =
    (type === "*" && subtype === "*") ||
    (type !== "*" && subtype === "*");
  const validExactType =
    type !== "*" && subtype !== "*" && TOKEN_PATTERN.test(subtype);
  if (!(TOKEN_PATTERN.test(type) && (validWildcard || validExactType))) {
    return;
  }

  const parameters = new Map<string, string>();
  let quality = 1;
  let qualitySeen = false;

  for (const segment of segments.slice(1)) {
    const equalsIndex = segment.indexOf("=");
    if (equalsIndex <= 0) {
      return;
    }
    const name = segment.slice(0, equalsIndex).trim().toLowerCase();
    const parameterValue = parseParameterValue(segment.slice(equalsIndex + 1));
    if (!TOKEN_PATTERN.test(name) || parameterValue === undefined) {
      return;
    }
    if (name === "q") {
      if (qualitySeen || !QVALUE_PATTERN.test(parameterValue)) {
        return;
      }
      quality = Number(parameterValue);
      qualitySeen = true;
      continue;
    }
    if (parameters.has(name)) {
      return;
    }
    parameters.set(name, parameterValue);
  }

  return { parameters, quality, subtype, type };
}

function parameterValuesMatch(name: string, left: string, right: string): boolean {
  if (name === "charset") {
    return left.toLowerCase() === right.toLowerCase();
  }
  return left === right;
}

function matches(range: MediaRange, representation: MediaType): boolean {
  if (range.type !== "*" && range.type !== representation.type) {
    return false;
  }
  if (range.subtype !== "*" && range.subtype !== representation.subtype) {
    return false;
  }
  for (const [name, value] of range.parameters) {
    const representationValue = representation.parameters.get(name);
    if (
      representationValue === undefined ||
      !parameterValuesMatch(name, value, representationValue)
    ) {
      return false;
    }
  }
  return true;
}

function typeSpecificity(range: MediaRange): number {
  if (range.type === "*") {
    return 0;
  }
  return range.subtype === "*" ? 1 : 2;
}

function compareSpecificity(left: MediaRange, right: MediaRange): number {
  return (
    typeSpecificity(left) - typeSpecificity(right) ||
    left.parameters.size - right.parameters.size ||
    left.quality - right.quality
  );
}

export function isMediaTypeAcceptable(
  acceptHeader: string | undefined,
  contentType: string
): boolean {
  if (acceptHeader === undefined) {
    return true;
  }

  const representation = parseMediaRange(contentType);
  const members = splitOutsideQuotes(acceptHeader, ",");
  if (!(representation && members)) {
    return false;
  }

  let bestMatch: MediaRange | undefined;
  for (const member of members) {
    if (!member.trim()) {
      continue;
    }
    const range = parseMediaRange(member);
    if (
      range &&
      matches(range, representation) &&
      (!bestMatch || compareSpecificity(range, bestMatch) > 0)
    ) {
      bestMatch = range;
    }
  }
  return (bestMatch?.quality ?? 0) > 0;
}
