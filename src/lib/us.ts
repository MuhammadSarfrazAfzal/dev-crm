/** US states, their main time zone, and the area codes that point to each state. */

export type UsState = { code: string; name: string; timeZone: string };

export const US_STATES: UsState[] = [
  { code: "AL", name: "Alabama", timeZone: "America/Chicago" },
  { code: "AK", name: "Alaska", timeZone: "America/Anchorage" },
  { code: "AZ", name: "Arizona", timeZone: "America/Phoenix" },
  { code: "AR", name: "Arkansas", timeZone: "America/Chicago" },
  { code: "CA", name: "California", timeZone: "America/Los_Angeles" },
  { code: "CO", name: "Colorado", timeZone: "America/Denver" },
  { code: "CT", name: "Connecticut", timeZone: "America/New_York" },
  { code: "DE", name: "Delaware", timeZone: "America/New_York" },
  { code: "DC", name: "District of Columbia", timeZone: "America/New_York" },
  { code: "FL", name: "Florida", timeZone: "America/New_York" },
  { code: "GA", name: "Georgia", timeZone: "America/New_York" },
  { code: "HI", name: "Hawaii", timeZone: "Pacific/Honolulu" },
  { code: "ID", name: "Idaho", timeZone: "America/Boise" },
  { code: "IL", name: "Illinois", timeZone: "America/Chicago" },
  { code: "IN", name: "Indiana", timeZone: "America/Indiana/Indianapolis" },
  { code: "IA", name: "Iowa", timeZone: "America/Chicago" },
  { code: "KS", name: "Kansas", timeZone: "America/Chicago" },
  { code: "KY", name: "Kentucky", timeZone: "America/New_York" },
  { code: "LA", name: "Louisiana", timeZone: "America/Chicago" },
  { code: "ME", name: "Maine", timeZone: "America/New_York" },
  { code: "MD", name: "Maryland", timeZone: "America/New_York" },
  { code: "MA", name: "Massachusetts", timeZone: "America/New_York" },
  { code: "MI", name: "Michigan", timeZone: "America/Detroit" },
  { code: "MN", name: "Minnesota", timeZone: "America/Chicago" },
  { code: "MS", name: "Mississippi", timeZone: "America/Chicago" },
  { code: "MO", name: "Missouri", timeZone: "America/Chicago" },
  { code: "MT", name: "Montana", timeZone: "America/Denver" },
  { code: "NE", name: "Nebraska", timeZone: "America/Chicago" },
  { code: "NV", name: "Nevada", timeZone: "America/Los_Angeles" },
  { code: "NH", name: "New Hampshire", timeZone: "America/New_York" },
  { code: "NJ", name: "New Jersey", timeZone: "America/New_York" },
  { code: "NM", name: "New Mexico", timeZone: "America/Denver" },
  { code: "NY", name: "New York", timeZone: "America/New_York" },
  { code: "NC", name: "North Carolina", timeZone: "America/New_York" },
  { code: "ND", name: "North Dakota", timeZone: "America/Chicago" },
  { code: "OH", name: "Ohio", timeZone: "America/New_York" },
  { code: "OK", name: "Oklahoma", timeZone: "America/Chicago" },
  { code: "OR", name: "Oregon", timeZone: "America/Los_Angeles" },
  { code: "PA", name: "Pennsylvania", timeZone: "America/New_York" },
  { code: "RI", name: "Rhode Island", timeZone: "America/New_York" },
  { code: "SC", name: "South Carolina", timeZone: "America/New_York" },
  { code: "SD", name: "South Dakota", timeZone: "America/Chicago" },
  { code: "TN", name: "Tennessee", timeZone: "America/Chicago" },
  { code: "TX", name: "Texas", timeZone: "America/Chicago" },
  { code: "UT", name: "Utah", timeZone: "America/Denver" },
  { code: "VT", name: "Vermont", timeZone: "America/New_York" },
  { code: "VA", name: "Virginia", timeZone: "America/New_York" },
  { code: "WA", name: "Washington", timeZone: "America/Los_Angeles" },
  { code: "WV", name: "West Virginia", timeZone: "America/New_York" },
  { code: "WI", name: "Wisconsin", timeZone: "America/Chicago" },
  { code: "WY", name: "Wyoming", timeZone: "America/Denver" },
  { code: "PR", name: "Puerto Rico", timeZone: "America/Puerto_Rico" },
];

const byCode = new Map(US_STATES.map((s) => [s.code, s]));
const byName = new Map(US_STATES.map((s) => [s.name.toLowerCase(), s]));

/** Accepts "TX", "tx", "Texas" or "texas" and returns "TX". */
export function normalizeState(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const v = raw.trim().replace(/\./g, "");
  if (!v) return null;
  if (byCode.has(v.toUpperCase())) return v.toUpperCase();
  return byName.get(v.toLowerCase())?.code ?? null;
}

export function stateName(code: string | null | undefined): string {
  return (code && byCode.get(code)?.name) || code || "";
}

export function timeZoneForState(raw: string | null | undefined): string | null {
  const code = normalizeState(raw);
  return code ? (byCode.get(code)?.timeZone ?? null) : null;
}

const MAJOR_CITIES_STATE: Record<string, string> = {
  columbus: "OH",
  cleveland: "OH",
  cincinnati: "OH",
  houston: "TX",
  dallas: "TX",
  austin: "TX",
  "san antonio": "TX",
  "fort worth": "TX",
  seattle: "WA",
  spokane: "WA",
  tacoma: "WA",
  chicago: "IL",
  "los angeles": "CA",
  "san francisco": "CA",
  "san diego": "CA",
  "san jose": "CA",
  denver: "CO",
  phoenix: "AZ",
  miami: "FL",
  orlando: "FL",
  tampa: "FL",
  "new york": "NY",
  brooklyn: "NY",
  manhattan: "NY",
  queens: "NY",
  atlanta: "GA",
  boston: "MA",
  philadelphia: "PA",
  detroit: "MI",
  nashville: "TN",
  portland: "OR",
  "las vegas": "NV",
};

export function inferStateFromLocation(city?: string | null, state?: string | null, phone?: string | null): string | null {
  const normalized = normalizeState(state);
  if (normalized) return normalized;

  if (city) {
    const c = city.trim().toLowerCase();
    if (MAJOR_CITIES_STATE[c]) return MAJOR_CITIES_STATE[c];
  }

  if (phone) {
    const digits = phone.replace(/\D/g, "");
    const match = digits.match(/^1?([2-9]\d{2})/);
    if (match) {
      const fromArea = stateForAreaCode(match[1]);
      if (fromArea) return fromArea;
    }
  }

  return null;
}

export function resolveCompanyTimeZone(opts: {
  timeZone?: string | null;
  state?: string | null;
  city?: string | null;
  phone?: string | null;
}): { timeZone: string; state: string | null } {
  const inferredState = inferStateFromLocation(opts.city, opts.state, opts.phone);
  if (inferredState) {
    const stateTz = timeZoneForState(inferredState);
    if (stateTz) return { timeZone: stateTz, state: inferredState };
  }
  if (opts.timeZone) {
    return { timeZone: opts.timeZone, state: opts.state ?? null };
  }
  return { timeZone: "America/New_York", state: opts.state ?? null };
}

/**
 * Geographic NANP area codes by state. Overlays included. Toll-free and non-geographic
 * codes (800s, 500, 600, 700, 900) are deliberately absent.
 */
const AREA_CODES: Record<string, string> = {
  AL: "205 251 256 334 659 938",
  AK: "907",
  AZ: "480 520 602 623 928",
  AR: "327 479 501 870",
  CA: "209 213 279 310 323 341 350 369 408 415 424 442 510 530 559 562 619 626 628 650 657 661 669 707 714 747 760 805 818 820 831 837 840 858 909 916 925 949 951",
  CO: "303 719 720 970 983",
  CT: "203 475 860 959",
  DE: "302",
  DC: "202 771",
  FL: "239 305 321 324 352 386 407 448 561 645 656 689 727 728 754 772 786 813 850 863 904 941 954",
  GA: "229 404 470 478 678 706 762 770 912 943",
  HI: "808",
  ID: "208 986",
  IL: "217 224 309 312 331 447 464 618 630 708 730 773 779 815 847 861 872",
  IN: "219 260 317 463 574 765 812 930",
  IA: "319 515 563 641 712",
  KS: "316 620 785 913",
  KY: "270 364 502 606 859",
  LA: "225 318 337 457 504 985",
  ME: "207",
  MD: "227 240 301 410 443 667",
  MA: "339 351 413 508 617 774 781 857 978",
  MI: "231 248 269 313 517 586 616 679 734 810 906 947 989",
  MN: "218 320 507 612 651 763 924 952",
  MS: "228 601 662 769",
  MO: "235 314 417 557 573 636 660 816 975",
  MT: "406",
  NE: "308 402 531",
  NV: "702 725 775",
  NH: "603",
  NJ: "201 551 609 640 732 848 856 862 908 973",
  NM: "505 575",
  NY: "212 315 329 332 347 363 516 518 585 607 624 631 646 680 716 718 838 845 914 917 929 934",
  NC: "252 336 472 704 743 828 910 919 980 984",
  ND: "701",
  OH: "216 220 234 283 326 330 380 419 436 440 513 567 614 740 937",
  OK: "405 539 572 580 918",
  OR: "458 503 541 971",
  PA: "215 223 267 272 412 445 484 570 582 610 717 724 814 835 878",
  RI: "401",
  SC: "803 821 839 843 854 864",
  SD: "605",
  TN: "423 615 629 731 865 901 931",
  TX: "210 214 254 281 325 346 361 409 430 432 469 512 682 713 726 737 806 817 830 832 903 915 936 940 945 956 972 979",
  UT: "385 435 801",
  VT: "802",
  VA: "276 434 540 571 686 703 757 804 826 948",
  WA: "206 253 360 425 509 564",
  WV: "304 681",
  WI: "262 274 353 414 534 608 715 920",
  WY: "307",
  PR: "787 939",
};

const areaCodeToState = new Map<string, string>();
for (const [state, codes] of Object.entries(AREA_CODES)) {
  for (const code of codes.split(" ")) areaCodeToState.set(code, state);
}

export function stateForAreaCode(areaCode: string | null | undefined): string | null {
  return (areaCode && areaCodeToState.get(areaCode)) || null;
}

/** States whose own telemarketing law narrows calling hours to 8 am–8 pm. */
export const EIGHT_TO_EIGHT_STATES = new Set(["FL", "OK"]);

/** States that need every party's consent to record a call. */
export const ALL_PARTY_RECORDING_STATES = new Set([
  "CA", "CT", "DE", "FL", "IL", "MD", "MA", "MI", "MT", "NV", "NH", "OR", "PA", "WA",
]);

/** Time zones shown in pickers, most common first. */
export const COMMON_TIME_ZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "America/Detroit",
  "America/Indiana/Indianapolis",
  "America/Boise",
  "America/Puerto_Rico",
];
