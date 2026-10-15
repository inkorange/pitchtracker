// MLB venue id -> postal locality, for the schema.org `location` field
// on the SportsEvent markup emitted by game pages.
//
// Google requires an Event to carry a `location` whose Place has an
// address; a Place with only a name is rejected, which is what
// produced the "Missing field location" error in Search Console.
//
// Keyed by MLB's numeric venue id, NOT by name, and deliberately so:
//   - Names are not unique across MLB's venue endpoint. Queried
//     without sportId=1 it returns ~1700 venues including minor-league
//     and amateur parks, among them an inactive "Dodger Stadium" in
//     Ft. Dodge, Iowa and a historic "Wrigley Field" in Los Angeles.
//     Keying by name resolved both to the wrong city.
//   - Sponsor renames churn constantly ("Rate Field", "Daikin Park",
//     "UNIQLO Field at Dodger Stadium" are all recent). Ids are stable
//     across renames; names are not.
//
// The Place's display name comes from the live schedule response, so
// a renamed park shows its current name with the address from here.
//
// Generated 2026-10-15 from the MLB Stats API venue endpoint
// (statsapi.mlb.com/api/v1/venues?sportId=1&season=YYYY&hydrate=location),
// unioned across every season present in pitch_games, so retired parks
// (O.co Coliseum, Turner Field, Safeco Field) resolve for old games.
//
// An unknown id degrades safely: the lookup returns null and the
// caller omits the SportsEvent block rather than emitting one that
// fails validation. Re-run the generator when a park opens.

export interface VenueLocation {
  city: string;
  /** State / province abbreviation, e.g. "PA". May be empty abroad. */
  region: string;
  /** ISO 3166-1 alpha-2, e.g. "US". */
  country: string;
}

const VENUE_LOCATIONS: Record<number, VenueLocation> = {
  1: { city: "Anaheim", region: "CA", country: "US" }, // Angel Stadium of Anaheim
  2: { city: "Baltimore", region: "MD", country: "US" }, // Oriole Park at Camden Yards
  3: { city: "Boston", region: "MA", country: "US" }, // Fenway Park
  4: { city: "Chicago", region: "IL", country: "US" }, // U.S. Cellular Field
  5: { city: "Cleveland", region: "OH", country: "US" }, // Progressive Field
  7: { city: "Kansas City", region: "MO", country: "US" }, // Kauffman Stadium
  10: { city: "Oakland", region: "CA", country: "US" }, // O.co Coliseum
  12: { city: "St. Petersburg", region: "FL", country: "US" }, // Tropicana Field
  13: { city: "Arlington", region: "TX", country: "US" }, // Globe Life Park in Arlington
  14: { city: "Toronto", region: "ON", country: "CA" }, // Rogers Centre
  15: { city: "Phoenix", region: "AZ", country: "US" }, // Chase Field
  16: { city: "Atlanta", region: "GA", country: "US" }, // Turner Field
  17: { city: "Chicago", region: "IL", country: "US" }, // Wrigley Field
  19: { city: "Denver", region: "CO", country: "US" }, // Coors Field
  22: { city: "Los Angeles", region: "CA", country: "US" }, // Dodger Stadium
  24: { city: "Montreal", region: "QC", country: "CA" }, // Olympic Stadium
  31: { city: "Pittsburgh", region: "PA", country: "US" }, // PNC Park
  32: { city: "Milwaukee", region: "WI", country: "US" }, // Miller Park
  401: { city: "United States", region: "", country: "US" }, // TBD
  680: { city: "Seattle", region: "WA", country: "US" }, // Safeco Field
  2392: { city: "Houston", region: "TX", country: "US" }, // Minute Maid Park
  2394: { city: "Detroit", region: "MI", country: "US" }, // Comerica Park
  2395: { city: "San Francisco", region: "CA", country: "US" }, // AT&T Park
  2397: { city: "Tokyo", region: "", country: "JP" }, // Tokyo Dome
  2500: { city: "Tempe", region: "AZ", country: "US" }, // Tempe Diablo Stadium
  2503: { city: "Las Vegas", region: "NV", country: "US" }, // Cashman Field
  2504: { city: "Lake Buena Vista", region: "FL", country: "US" }, // Champion Stadium
  2507: { city: "Mesa", region: "AZ", country: "US" }, // Hohokam Stadium
  2508: { city: "Sarasota", region: "FL", country: "US" }, // Ed Smith Stadium
  2511: { city: "Lakeland", region: "FL", country: "US" }, // Joker Marchant Stadium
  2513: { city: "Viera", region: "FL", country: "US" }, // Space Coast Stadium
  2514: { city: "Kissimmee", region: "FL", country: "US" }, // Osceola County Stadium
  2518: { city: "Phoenix", region: "AZ", country: "US" }, // Maryvale Baseball Park
  2520: { city: "Jupiter", region: "FL", country: "US" }, // Roger Dean Stadium
  2523: { city: "Tampa", region: "FL", country: "US" }, // George M. Steinbrenner Field
  2524: { city: "Phoenix", region: "AZ", country: "US" }, // Phoenix Municipal Stadium
  2526: { city: "Bradenton", region: "FL", country: "US" }, // McKechnie Field
  2529: { city: "Sacramento", region: "CA", country: "US" }, // Raley Field
  2530: { city: "Peoria", region: "AZ", country: "US" }, // Peoria Stadium
  2532: { city: "Scottsdale", region: "AZ", country: "US" }, // Scottsdale Stadium
  2534: { city: "Port Charlotte", region: "FL", country: "US" }, // Charlotte Sports Park
  2535: { city: "San Juan", region: "PR", country: "PR" }, // Hiram Bithorn Stadium
  2536: { city: "Dunedin", region: "FL", country: "US" }, // Florida Auto Exchange Stadium
  2542: { city: "Memphis", region: "TN", country: "US" }, // AutoZone Park
  2602: { city: "Cincinnati", region: "OH", country: "US" }, // Great American Ball Park
  2603: { city: "Surprise", region: "AZ", country: "US" }, // Surprise Stadium
  2680: { city: "San Diego", region: "CA", country: "US" }, // Petco Park
  2681: { city: "Philadelphia", region: "PA", country: "US" }, // Citizens Bank Park
  2700: { city: "Clearwater", region: "FL", country: "US" }, // Bright House Field
  2701: { city: "Monterrey", region: "MX", country: "MX" }, // Estadio de Beisbol Monterrey
  2722: { city: "Springfield", region: "MO", country: "US" }, // Route 66 Stadium
  2724: { city: "Louisville", region: "KY", country: "US" }, // Louisville Slugger Field
  2735: { city: "Williamsport", region: "PA", country: "US" }, // BB&T Ballpark
  2756: { city: "Buffalo", region: "NY", country: "US" }, // Sahlen Field
  2766: { city: "Dayton", region: "OH", country: "US" }, // Day Air Ballpark
  2781: { city: "Norfolk", region: "VA", country: "US" }, // Harbor Park
  2814: { city: "Montgomery", region: "AL", country: "US" }, // Montgomery Riverwalk Stadium
  2856: { city: "Port St. Lucie", region: "FL", country: "US" }, // Tradition Field
  2862: { city: "Fort Myers", region: "FL", country: "US" }, // Hammond Stadium
  2889: { city: "St. Louis", region: "MO", country: "US" }, // Busch Stadium
  3049: { city: "Santo Domingo", region: "", country: "DO" }, // Estadio Quisqueya Juan Marichal
  3289: { city: "Flushing", region: "NY", country: "US" }, // Citi Field
  3309: { city: "Washington", region: "DC", country: "US" }, // Nationals Park
  3312: { city: "Minneapolis", region: "MN", country: "US" }, // Target Field
  3313: { city: "Bronx", region: "NY", country: "US" }, // Yankee Stadium
  3329: { city: "Springdale", region: "AR", country: "US" }, // Arvest Ballpark
  3809: { city: "Glendale", region: "AZ", country: "US" }, // Camelback Ranch
  3834: { city: "Goodyear", region: "AZ", country: "US" }, // Goodyear Ballpark
  3949: { city: "Birmingham", region: "AL", country: "US" }, // Rickwood Field
  4169: { city: "Miami", region: "FL", country: "US" }, // Marlins Park
  4249: { city: "Scottsdale", region: "AZ", country: "US" }, // Salt River Fields at Talking Stick
  4271: { city: "Papillion", region: "NE", country: "US" }, // Werner Park
  4309: { city: "Ft. Myers", region: "FL", country: "US" }, // JetBlue Park
  4329: { city: "Pensacola", region: "FL", country: "US" }, // Pensacola Bayfront Stadium
  4389: { city: "Panama City", region: "", country: "PA" }, // Estadio Nacional Rod Carew
  4469: { city: "San Antonio", region: "TX", country: "US" }, // Alamodome
  4529: { city: "Birmingham", region: "AL", country: "US" }, // Regions Field
  4589: { city: "Sydney", region: "", country: "AU" }, // Sydney Cricket Ground
  4629: { city: "Mesa", region: "AZ", country: "US" }, // Cubs Park
  4669: { city: "El Paso", region: "TX", country: "US" }, // Southwest University Park
  4670: { city: "Charlotte", region: "NC", country: "US" }, // BB&T Ballpark
  4700: { city: "San Diego", region: "CA", country: "US" }, // Fowler Park and Cunningham Field
  4705: { city: "Atlanta", region: "GA", country: "US" }, // SunTrust Park
  5000: { city: "West Palm Beach", region: "FL", country: "US" }, // FITTEAM Ballpark of the Palm Beaches
  5150: { city: "Seoul", region: "", country: "KR" }, // Gocheok Sky Dome
  5325: { city: "Arlington", region: "TX", country: "US" }, // Globe Life Field
  5340: { city: "Mexico City", region: "", country: "MX" }, // Estadio Alfredo Harp Helu
  5355: { city: "Las Vegas", region: "NV", country: "US" }, // Las Vegas Ballpark
  5380: { city: "North Port", region: "FL", country: "US" }, // CoolToday Park
  5381: { city: "London", region: "", country: "GB" }, // London Stadium
  5421: { city: "Sugar Land", region: "TX", country: "US" }, // Constellation Field
  5445: { city: "Dyersville", region: "IA", country: "US" }, // Field of Dreams
  6130: { city: "Bristol", region: "TN", country: "US" }, // Bristol Motor Speedway
};

/**
 * Resolve an MLB venue id to a postal locality.
 *
 * Returns null for an unknown venue. Callers MUST treat null as "do
 * not emit Event markup for this page" — an Event without a complete
 * location is a Search Console error, which is what this module exists
 * to prevent.
 */
export function lookupVenueLocation(
  venueId: number | null | undefined,
): VenueLocation | null {
  if (typeof venueId !== "number") return null;
  return VENUE_LOCATIONS[venueId] ?? null;
}
