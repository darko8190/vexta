/**
 * Countries and their subdivisions, for every address field in the application.
 *
 * The list is generated once and committed rather than read from `Intl.DisplayNames` at
 * runtime. The browser's answer depends on its ICU version -- "États-Unis" on one machine and
 * "États-Unis d'Amérique" on another -- and these strings are stored, not just displayed, so a
 * drifting label would mean two spellings of the same country in the database and an address
 * that no longer matches itself.
 *
 * The stored value is the French name, which is what the column already held before there was a
 * list. A code would have read better but would have meant rewriting every existing address and
 * every document that prints one, to gain nothing a person can see.
 */

export type GeoOption = { code: string; name: string };

/** Offered first, above the full list: where the work actually is. */
export const nearbyCountryCodes = ["CA", "US"] as const;

export const defaultCountryName = "Canada";

export const countries: GeoOption[] = [
  { code: "AF", name: "Afghanistan" },
  { code: "ZA", name: "Afrique du Sud" },
  { code: "AL", name: "Albanie" },
  { code: "DZ", name: "Algérie" },
  { code: "DE", name: "Allemagne" },
  { code: "AD", name: "Andorre" },
  { code: "AO", name: "Angola" },
  { code: "AI", name: "Anguilla" },
  { code: "AG", name: "Antigua-et-Barbuda" },
  { code: "SA", name: "Arabie saoudite" },
  { code: "AR", name: "Argentine" },
  { code: "AM", name: "Arménie" },
  { code: "AW", name: "Aruba" },
  { code: "AU", name: "Australie" },
  { code: "AT", name: "Autriche" },
  { code: "AZ", name: "Azerbaïdjan" },
  { code: "BS", name: "Bahamas" },
  { code: "BH", name: "Bahreïn" },
  { code: "BD", name: "Bangladesh" },
  { code: "BB", name: "Barbade" },
  { code: "BE", name: "Belgique" },
  { code: "BZ", name: "Belize" },
  { code: "BJ", name: "Bénin" },
  { code: "DY", name: "Bénin" },
  { code: "BM", name: "Bermudes" },
  { code: "BT", name: "Bhoutan" },
  { code: "BY", name: "Biélorussie" },
  { code: "BO", name: "Bolivie" },
  { code: "BA", name: "Bosnie-Herzégovine" },
  { code: "BW", name: "Botswana" },
  { code: "BR", name: "Brésil" },
  { code: "BN", name: "Brunei" },
  { code: "BG", name: "Bulgarie" },
  { code: "BF", name: "Burkina Faso" },
  { code: "HV", name: "Burkina Faso" },
  { code: "BI", name: "Burundi" },
  { code: "KH", name: "Cambodge" },
  { code: "CM", name: "Cameroun" },
  { code: "CA", name: "Canada" },
  { code: "CV", name: "Cap-Vert" },
  { code: "CL", name: "Chili" },
  { code: "CN", name: "Chine" },
  { code: "CY", name: "Chypre" },
  { code: "CO", name: "Colombie" },
  { code: "KM", name: "Comores" },
  { code: "CG", name: "Congo-Brazzaville" },
  { code: "CD", name: "Congo-Kinshasa" },
  { code: "KP", name: "Corée du Nord" },
  { code: "KR", name: "Corée du Sud" },
  { code: "CR", name: "Costa Rica" },
  { code: "CI", name: "Côte d'Ivoire" },
  { code: "HR", name: "Croatie" },
  { code: "CU", name: "Cuba" },
  { code: "CW", name: "Curaçao" },
  { code: "DK", name: "Danemark" },
  { code: "DJ", name: "Djibouti" },
  { code: "DM", name: "Dominique" },
  { code: "EG", name: "Égypte" },
  { code: "AE", name: "Émirats arabes unis" },
  { code: "EC", name: "Équateur" },
  { code: "ER", name: "Érythrée" },
  { code: "ES", name: "Espagne" },
  { code: "EE", name: "Estonie" },
  { code: "SZ", name: "Eswatini" },
  { code: "VA", name: "État de la Cité du Vatican" },
  { code: "US", name: "États-Unis" },
  { code: "ET", name: "Éthiopie" },
  { code: "FJ", name: "Fidji" },
  { code: "FI", name: "Finlande" },
  { code: "FR", name: "France" },
  { code: "GA", name: "Gabon" },
  { code: "GM", name: "Gambie" },
  { code: "GE", name: "Géorgie" },
  { code: "GH", name: "Ghana" },
  { code: "GI", name: "Gibraltar" },
  { code: "GR", name: "Grèce" },
  { code: "GD", name: "Grenade" },
  { code: "GL", name: "Groenland" },
  { code: "GP", name: "Guadeloupe" },
  { code: "GU", name: "Guam" },
  { code: "GT", name: "Guatemala" },
  { code: "GG", name: "Guernesey" },
  { code: "GN", name: "Guinée" },
  { code: "GQ", name: "Guinée équatoriale" },
  { code: "GW", name: "Guinée-Bissau" },
  { code: "GY", name: "Guyana" },
  { code: "GF", name: "Guyane française" },
  { code: "HT", name: "Haïti" },
  { code: "HN", name: "Honduras" },
  { code: "HU", name: "Hongrie" },
  { code: "CX", name: "Île Christmas" },
  { code: "IM", name: "Île de Man" },
  { code: "NF", name: "Île Norfolk" },
  { code: "AX", name: "Îles Åland" },
  { code: "KY", name: "Îles Caïmans" },
  { code: "CC", name: "Îles Cocos" },
  { code: "CK", name: "Îles Cook" },
  { code: "FO", name: "Îles Féroé" },
  { code: "FK", name: "Îles Malouines" },
  { code: "MP", name: "Îles Mariannes du Nord" },
  { code: "MH", name: "Îles Marshall" },
  { code: "PN", name: "Îles Pitcairn" },
  { code: "SB", name: "Îles Salomon" },
  { code: "TC", name: "Îles Turques-et-Caïques" },
  { code: "VG", name: "Îles Vierges britanniques" },
  { code: "VI", name: "Îles Vierges des États-Unis" },
  { code: "IN", name: "Inde" },
  { code: "ID", name: "Indonésie" },
  { code: "IQ", name: "Irak" },
  { code: "IR", name: "Iran" },
  { code: "IE", name: "Irlande" },
  { code: "IS", name: "Islande" },
  { code: "IL", name: "Israël" },
  { code: "IT", name: "Italie" },
  { code: "JM", name: "Jamaïque" },
  { code: "JP", name: "Japon" },
  { code: "JE", name: "Jersey" },
  { code: "JO", name: "Jordanie" },
  { code: "KZ", name: "Kazakhstan" },
  { code: "KE", name: "Kenya" },
  { code: "KG", name: "Kirghizstan" },
  { code: "KI", name: "Kiribati" },
  { code: "XK", name: "Kosovo" },
  { code: "KW", name: "Koweït" },
  { code: "RE", name: "La Réunion" },
  { code: "LA", name: "Laos" },
  { code: "LS", name: "Lesotho" },
  { code: "LV", name: "Lettonie" },
  { code: "LB", name: "Liban" },
  { code: "LR", name: "Liberia" },
  { code: "LY", name: "Libye" },
  { code: "LI", name: "Liechtenstein" },
  { code: "LT", name: "Lituanie" },
  { code: "LU", name: "Luxembourg" },
  { code: "MK", name: "Macédoine du Nord" },
  { code: "MG", name: "Madagascar" },
  { code: "MY", name: "Malaisie" },
  { code: "MW", name: "Malawi" },
  { code: "MV", name: "Maldives" },
  { code: "ML", name: "Mali" },
  { code: "MT", name: "Malte" },
  { code: "MA", name: "Maroc" },
  { code: "MQ", name: "Martinique" },
  { code: "MU", name: "Maurice" },
  { code: "MR", name: "Mauritanie" },
  { code: "YT", name: "Mayotte" },
  { code: "MX", name: "Mexique" },
  { code: "FM", name: "Micronésie" },
  { code: "MD", name: "Moldavie" },
  { code: "MC", name: "Monaco" },
  { code: "MN", name: "Mongolie" },
  { code: "ME", name: "Monténégro" },
  { code: "MS", name: "Montserrat" },
  { code: "MZ", name: "Mozambique" },
  { code: "MM", name: "Myanmar (Birmanie)" },
  { code: "NA", name: "Namibie" },
  { code: "NR", name: "Nauru" },
  { code: "NP", name: "Népal" },
  { code: "NI", name: "Nicaragua" },
  { code: "NE", name: "Niger" },
  { code: "NG", name: "Nigeria" },
  { code: "NU", name: "Niue" },
  { code: "NO", name: "Norvège" },
  { code: "NC", name: "Nouvelle-Calédonie" },
  { code: "NZ", name: "Nouvelle-Zélande" },
  { code: "OM", name: "Oman" },
  { code: "UG", name: "Ouganda" },
  { code: "UZ", name: "Ouzbékistan" },
  { code: "PK", name: "Pakistan" },
  { code: "PW", name: "Palaos" },
  { code: "PA", name: "Panama" },
  { code: "PG", name: "Papouasie-Nouvelle-Guinée" },
  { code: "PY", name: "Paraguay" },
  { code: "NL", name: "Pays-Bas" },
  { code: "BQ", name: "Pays-Bas caribéens" },
  { code: "PE", name: "Pérou" },
  { code: "PH", name: "Philippines" },
  { code: "PL", name: "Pologne" },
  { code: "PF", name: "Polynésie française" },
  { code: "PR", name: "Porto Rico" },
  { code: "PT", name: "Portugal" },
  { code: "QA", name: "Qatar" },
  { code: "HK", name: "R.A.S. chinoise de Hong Kong" },
  { code: "MO", name: "R.A.S. chinoise de Macao" },
  { code: "CF", name: "République centrafricaine" },
  { code: "DO", name: "République dominicaine" },
  { code: "RO", name: "Roumanie" },
  { code: "GB", name: "Royaume-Uni" },
  { code: "UK", name: "Royaume-Uni" },
  { code: "RU", name: "Russie" },
  { code: "RW", name: "Rwanda" },
  { code: "EH", name: "Sahara occidental" },
  { code: "BL", name: "Saint-Barthélemy" },
  { code: "KN", name: "Saint-Christophe-et-Niévès" },
  { code: "SM", name: "Saint-Marin" },
  { code: "MF", name: "Saint-Martin" },
  { code: "SX", name: "Saint-Martin (partie néerlandaise)" },
  { code: "PM", name: "Saint-Pierre-et-Miquelon" },
  { code: "VC", name: "Saint-Vincent-et-les Grenadines" },
  { code: "SH", name: "Sainte-Hélène" },
  { code: "LC", name: "Sainte-Lucie" },
  { code: "SV", name: "Salvador" },
  { code: "WS", name: "Samoa" },
  { code: "AS", name: "Samoa américaines" },
  { code: "ST", name: "Sao Tomé-et-Principe" },
  { code: "SN", name: "Sénégal" },
  { code: "RS", name: "Serbie" },
  { code: "CQ", name: "Sercq" },
  { code: "SC", name: "Seychelles" },
  { code: "SL", name: "Sierra Leone" },
  { code: "SG", name: "Singapour" },
  { code: "SK", name: "Slovaquie" },
  { code: "SI", name: "Slovénie" },
  { code: "SO", name: "Somalie" },
  { code: "SD", name: "Soudan" },
  { code: "SS", name: "Soudan du Sud" },
  { code: "LK", name: "Sri Lanka" },
  { code: "SE", name: "Suède" },
  { code: "CH", name: "Suisse" },
  { code: "SR", name: "Suriname" },
  { code: "SY", name: "Syrie" },
  { code: "TJ", name: "Tadjikistan" },
  { code: "TW", name: "Taïwan" },
  { code: "TZ", name: "Tanzanie" },
  { code: "TD", name: "Tchad" },
  { code: "CZ", name: "Tchéquie" },
  { code: "PS", name: "Territoires palestiniens" },
  { code: "TH", name: "Thaïlande" },
  { code: "TL", name: "Timor oriental" },
  { code: "TG", name: "Togo" },
  { code: "TK", name: "Tokelau" },
  { code: "TO", name: "Tonga" },
  { code: "TT", name: "Trinité-et-Tobago" },
  { code: "TN", name: "Tunisie" },
  { code: "TM", name: "Turkménistan" },
  { code: "TR", name: "Turquie" },
  { code: "TV", name: "Tuvalu" },
  { code: "UA", name: "Ukraine" },
  { code: "UY", name: "Uruguay" },
  { code: "NH", name: "Vanuatu" },
  { code: "VU", name: "Vanuatu" },
  { code: "VE", name: "Venezuela" },
  { code: "VD", name: "Viêt Nam" },
  { code: "VN", name: "Viêt Nam" },
  { code: "WF", name: "Wallis-et-Futuna" },
  { code: "YD", name: "Yémen" },
  { code: "YE", name: "Yémen" },
  { code: "ZM", name: "Zambie" },
  { code: "RH", name: "Zimbabwe" },
  { code: "ZW", name: "Zimbabwe" },
];

/**
 * Subdivisions, for the countries where an address is unusable without one. Everywhere else the
 * field stays free text: a list that is missing the caller's region is worse than a box, because
 * a box can still be filled in.
 */
export const subdivisionsByCountry: Record<string, GeoOption[]> = {
  CA: [
    { code: "AB", name: "Alberta" },
    { code: "BC", name: "Colombie-Britannique" },
    { code: "PE", name: "Île-du-Prince-Édouard" },
    { code: "MB", name: "Manitoba" },
    { code: "NB", name: "Nouveau-Brunswick" },
    { code: "NS", name: "Nouvelle-Écosse" },
    { code: "NU", name: "Nunavut" },
    { code: "ON", name: "Ontario" },
    { code: "QC", name: "Québec" },
    { code: "SK", name: "Saskatchewan" },
    { code: "NL", name: "Terre-Neuve-et-Labrador" },
    { code: "NT", name: "Territoires du Nord-Ouest" },
    { code: "YT", name: "Yukon" },
  ],
  US: [
    { code: "AL", name: "Alabama" },
    { code: "AK", name: "Alaska" },
    { code: "AZ", name: "Arizona" },
    { code: "AR", name: "Arkansas" },
    { code: "CA", name: "Californie" },
    { code: "NC", name: "Caroline du Nord" },
    { code: "SC", name: "Caroline du Sud" },
    { code: "CO", name: "Colorado" },
    { code: "CT", name: "Connecticut" },
    { code: "ND", name: "Dakota du Nord" },
    { code: "SD", name: "Dakota du Sud" },
    { code: "DE", name: "Delaware" },
    { code: "DC", name: "District de Columbia" },
    { code: "FL", name: "Floride" },
    { code: "GA", name: "Géorgie" },
    { code: "HI", name: "Hawaï" },
    { code: "ID", name: "Idaho" },
    { code: "IL", name: "Illinois" },
    { code: "IN", name: "Indiana" },
    { code: "IA", name: "Iowa" },
    { code: "KS", name: "Kansas" },
    { code: "KY", name: "Kentucky" },
    { code: "LA", name: "Louisiane" },
    { code: "ME", name: "Maine" },
    { code: "MD", name: "Maryland" },
    { code: "MA", name: "Massachusetts" },
    { code: "MI", name: "Michigan" },
    { code: "MN", name: "Minnesota" },
    { code: "MS", name: "Mississippi" },
    { code: "MO", name: "Missouri" },
    { code: "MT", name: "Montana" },
    { code: "NE", name: "Nebraska" },
    { code: "NV", name: "Nevada" },
    { code: "NH", name: "New Hampshire" },
    { code: "NJ", name: "New Jersey" },
    { code: "NY", name: "New York" },
    { code: "NM", name: "Nouveau-Mexique" },
    { code: "OH", name: "Ohio" },
    { code: "OK", name: "Oklahoma" },
    { code: "OR", name: "Oregon" },
    { code: "PA", name: "Pennsylvanie" },
    { code: "RI", name: "Rhode Island" },
    { code: "TN", name: "Tennessee" },
    { code: "TX", name: "Texas" },
    { code: "UT", name: "Utah" },
    { code: "VT", name: "Vermont" },
    { code: "VA", name: "Virginie" },
    { code: "WV", name: "Virginie-Occidentale" },
    { code: "WA", name: "Washington" },
    { code: "WI", name: "Wisconsin" },
    { code: "WY", name: "Wyoming" },
  ],
};


const countryByName = new Map(countries.map((c) => [normalizeGeo(c.name), c]));

/** Loose enough to match what was typed by hand before there was a list: case and accents. */
export function normalizeGeo(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** The country code behind a stored name, or null when it was typed freely. */
export function countryCodeForName(name: string | null | undefined): string | null {
  if (!name) return null;
  return countryByName.get(normalizeGeo(name))?.code ?? null;
}

/** The subdivisions to offer for a stored country name, empty when the field stays free text. */
export function subdivisionsForCountryName(name: string | null | undefined): GeoOption[] {
  const code = countryCodeForName(name);
  return code ? (subdivisionsByCountry[code] ?? []) : [];
}

/**
 * The countries in the order they are offered: the two that matter here, then the rest.
 * Already-sorted by French collation at generation time, so nothing sorts at runtime.
 */
export const countryOptions: GeoOption[] = [
  ...nearbyCountryCodes.map((code) => countries.find((c) => c.code === code)!),
  ...countries.filter((c) => !nearbyCountryCodes.includes(c.code as (typeof nearbyCountryCodes)[number])),
];

/** True when the stored subdivision is one of the offered ones for that country. */
export function isKnownSubdivision(countryName: string | null | undefined, subdivision: string | null | undefined): boolean {
  if (!subdivision) return true;
  const list = subdivisionsForCountryName(countryName);
  if (list.length === 0) return true;
  const wanted = normalizeGeo(subdivision);
  return list.some((option) => normalizeGeo(option.name) === wanted || option.code.toLowerCase() === wanted);
}

/**
 * What that line of an address is called where it is being written. A Canadian writes a
 * province, an American a state, and asking a Belgian for a province would be asking for
 * something their address does not have.
 */
export function subdivisionLabel(countryName: string | null | undefined): string {
  const code = countryCodeForName(countryName);
  if (code === "CA") return "Province";
  if (code === "US") return "État";
  return "Région (optionnel)";
}
