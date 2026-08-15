/**
 * IATA airport code -> IANA timezone, with enough name to run a picker.
 *
 * PLAN.md §8: converting a typed local time to a UTC instant needs the zone,
 * and the user types an airport code, not `Europe/London`. This table closes
 * that gap. Bundled rather than fetched — an airport is exactly where you are
 * when you need it, and exactly where the network is worst.
 *
 * Kept in its own module and imported lazily: the timeline never needs it, only
 * the add/edit flight form does, so it is a separate chunk rather than weight
 * on first paint. The service worker still precaches it, so the picker works
 * offline.
 *
 * Encoded as one tab-separated line per airport against a shared zone array and
 * parsed on first use — an object literal of the same data is several times
 * larger and slower to parse.
 *
 * Source: OpenFlights (https://openflights.org/data.php), snapshot 2026-08-15,
 * filtered to entries with a real three-letter IATA code and a timezone. Made
 * available by OpenFlights under the Open Database License (ODbL); this file is
 * a derived database and carries the same terms.
 *
 * Regenerate: python3 scripts/build-airports.py path/to/airports.dat
 */

const ZONES: readonly string[] = ["Africa/Abidjan","Africa/Accra","Africa/Addis_Ababa","Africa/Algiers","Africa/Asmera","Africa/Bamako","Africa/Bangui","Africa/Banjul","Africa/Bissau","Africa/Blantyre","Africa/Brazzaville","Africa/Bujumbura","Africa/Cairo","Africa/Casablanca","Africa/Conakry","Africa/Dakar","Africa/Dar_es_Salaam","Africa/Djibouti","Africa/Douala","Africa/El_Aaiun","Africa/Freetown","Africa/Gaborone","Africa/Harare","Africa/Johannesburg","Africa/Juba","Africa/Kampala","Africa/Khartoum","Africa/Kigali","Africa/Kinshasa","Africa/Lagos","Africa/Libreville","Africa/Lome","Africa/Luanda","Africa/Lubumbashi","Africa/Lusaka","Africa/Malabo","Africa/Maputo","Africa/Maseru","Africa/Mbabane","Africa/Mogadishu","Africa/Monrovia","Africa/Nairobi","Africa/Ndjamena","Africa/Niamey","Africa/Nouakchott","Africa/Ouagadougou","Africa/Porto-Novo","Africa/Sao_Tome","Africa/Tripoli","Africa/Tunis","Africa/Windhoek","America/Adak","America/Anchorage","America/Anguilla","America/Antigua","America/Argentina/La_Rioja","America/Argentina/Rio_Gallegos","America/Argentina/Salta","America/Argentina/San_Juan","America/Argentina/San_Luis","America/Argentina/Tucuman","America/Argentina/Ushuaia","America/Aruba","America/Asuncion","America/Barbados","America/Belem","America/Belize","America/Blanc-Sablon","America/Boa_Vista","America/Bogota","America/Buenos_Aires","America/Campo_Grande","America/Cancun","America/Caracas","America/Catamarca","America/Cayenne","America/Cayman","America/Chicago","America/Coral_Harbour","America/Cordoba","America/Costa_Rica","America/Curacao","America/Dawson_Creek","America/Denver","America/Dominica","America/Edmonton","America/El_Salvador","America/Fortaleza","America/Godthab","America/Grand_Turk","America/Grenada","America/Guadeloupe","America/Guatemala","America/Guayaquil","America/Guyana","America/Halifax","America/Havana","America/Hermosillo","America/Jamaica","America/Jujuy","America/La_Paz","America/Lima","America/Los_Angeles","America/Managua","America/Martinique","America/Mazatlan","America/Mendoza","America/Mexico_City","America/Miquelon","America/Montevideo","America/Montserrat","America/Nassau","America/New_York","America/Panama","America/Paramaribo","America/Phoenix","America/Port-au-Prince","America/Port_of_Spain","America/Puerto_Rico","America/Regina","America/Rio_Branco","America/Santiago","America/Santo_Domingo","America/Sao_Paulo","America/Scoresbysund","America/St_Johns","America/St_Kitts","America/St_Lucia","America/St_Thomas","America/St_Vincent","America/Tegucigalpa","America/Thule","America/Tijuana","America/Toronto","America/Tortola","America/Vancouver","America/Winnipeg","Antarctica/South_Pole","Arctic/Longyearbyen","Asia/Aden","Asia/Amman","Asia/Anadyr","Asia/Ashgabat","Asia/Baghdad","Asia/Bahrain","Asia/Baku","Asia/Bangkok","Asia/Beirut","Asia/Bishkek","Asia/Brunei","Asia/Calcutta","Asia/Colombo","Asia/Damascus","Asia/Dhaka","Asia/Dili","Asia/Dubai","Asia/Dushanbe","Asia/Gaza","Asia/Hong_Kong","Asia/Hovd","Asia/Irkutsk","Asia/Jakarta","Asia/Jayapura","Asia/Jerusalem","Asia/Kabul","Asia/Karachi","Asia/Katmandu","Asia/Krasnoyarsk","Asia/Kuala_Lumpur","Asia/Kuwait","Asia/Macau","Asia/Makassar","Asia/Manila","Asia/Muscat","Asia/Nicosia","Asia/Omsk","Asia/Oral","Asia/Phnom_Penh","Asia/Pyongyang","Asia/Qatar","Asia/Qyzylorda","Asia/Rangoon","Asia/Riyadh","Asia/Saigon","Asia/Samarkand","Asia/Seoul","Asia/Shanghai","Asia/Singapore","Asia/Srednekolymsk","Asia/Taipei","Asia/Tbilisi","Asia/Tehran","Asia/Thimphu","Asia/Tokyo","Asia/Ulaanbaatar","Asia/Vientiane","Asia/Vladivostok","Asia/Yakutsk","Asia/Yekaterinburg","Asia/Yerevan","Atlantic/Azores","Atlantic/Bermuda","Atlantic/Canary","Atlantic/Cape_Verde","Atlantic/Faeroe","Atlantic/Reykjavik","Atlantic/St_Helena","Atlantic/Stanley","Australia/Adelaide","Australia/Brisbane","Australia/Darwin","Australia/Hobart","Australia/Lord_Howe","Australia/Melbourne","Australia/Perth","Australia/Sydney","Europe/Amsterdam","Europe/Athens","Europe/Belgrade","Europe/Berlin","Europe/Bratislava","Europe/Brussels","Europe/Bucharest","Europe/Budapest","Europe/Chisinau","Europe/Copenhagen","Europe/Dublin","Europe/Gibraltar","Europe/Guernsey","Europe/Helsinki","Europe/Isle_of_Man","Europe/Istanbul","Europe/Jersey","Europe/Kaliningrad","Europe/Kiev","Europe/Lisbon","Europe/Ljubljana","Europe/London","Europe/Luxembourg","Europe/Madrid","Europe/Malta","Europe/Mariehamn","Europe/Minsk","Europe/Moscow","Europe/Oslo","Europe/Paris","Europe/Podgorica","Europe/Prague","Europe/Riga","Europe/Rome","Europe/Samara","Europe/Sarajevo","Europe/Simferopol","Europe/Skopje","Europe/Sofia","Europe/Stockholm","Europe/Tallinn","Europe/Tirane","Europe/Vienna","Europe/Vilnius","Europe/Warsaw","Europe/Zagreb","Europe/Zurich","Indian/Antananarivo","Indian/Chagos","Indian/Christmas","Indian/Cocos","Indian/Comoro","Indian/Mahe","Indian/Maldives","Indian/Mauritius","Indian/Mayotte","Indian/Reunion","Pacific/Apia","Pacific/Auckland","Pacific/Chatham","Pacific/Easter","Pacific/Efate","Pacific/Enderbury","Pacific/Fiji","Pacific/Funafuti","Pacific/Galapagos","Pacific/Gambier","Pacific/Guadalcanal","Pacific/Guam","Pacific/Honolulu","Pacific/Johnston","Pacific/Kosrae","Pacific/Majuro","Pacific/Marquesas","Pacific/Midway","Pacific/Nauru","Pacific/Niue","Pacific/Norfolk","Pacific/Noumea","Pacific/Pago_Pago","Pacific/Palau","Pacific/Ponape","Pacific/Port_Moresby","Pacific/Rarotonga","Pacific/Saipan","Pacific/Tahiti","Pacific/Tarawa","Pacific/Tongatapu","Pacific/Truk","Pacific/Wallis"];

const TABLE = `AAA	301	Anaa Airport	Anaa	French Polynesia
AAC	12	El Arish International Airport	El Arish	Egypt
AAE	3	Rabah Bitat Airport	Annaba	Algeria
AAF	112	Apalachicola Regional Airport	Apalachicola	United States
AAH	219	Aachen-Merzbrück Airport	Aachen	Germany
AAL	225	Aalborg Airport	Aalborg	Denmark
AAM	23	Malamala Airport	Malamala	South Africa
AAN	155	Al Ain International Airport	Al Ain	United Arab Emirates
AAO	73	Anaco Airport	Anaco	Venezuela
AAP	77	Andrau Airpark	Houston	United States
AAQ	243	Anapa Vityazevo Airport	Anapa	Russia
AAR	225	Aarhus Airport	Aarhus	Denmark
AAT	186	Altay Air Base	Altay	China
AAX	123	Romeu Zema Airport	Araxa	Brazil
AAY	139	Al Ghaidah International Airport	Al Ghaidah Intl	Yemen
AAZ	92	Quezaltenango Airport	Quezaltenango	Guatemala
ABA	167	Abakan Airport	Abakan	Russia
ABB	29	Asaba International Airport	Asaba	Nigeria
ABC	239	Albacete-Los Llanos Airport	Albacete	Spain
ABD	191	Abadan Airport	Abadan	Iran
ABE	112	Lehigh Valley International Airport	Allentown	United States
ABF	302	Abaiang Airport	Abaiang Atoll	Kiribati
ABI	77	Abilene Regional Airport	Abilene	United States
ABJ	0	Port Bouet Airport	Abidjan	Cote d'Ivoire
ABK	2	Kabri Dehar Airport	Kabri Dehar	Ethiopia
ABL	52	Ambler Airport	Ambler	United States
ABM	209	Northern Peninsula Airport	Amberley	Australia
ABN	114	Albina Airport	Albina	Suriname
ABQ	83	Albuquerque International Sunport	Albuquerque	United States
ABR	77	Aberdeen Regional Airport	Aberdeen	United States
ABS	12	Abu Simbel Airport	Abu Simbel	Egypt
ABT	182	Al Baha Airport	El-baha	Saudi Arabia
ABV	29	Nnamdi Azikiwe International Airport	Abuja	Nigeria
ABX	215	Albury Airport	Albury	Australia
ABY	112	Southwest Georgia Regional Airport	Albany	United States
ABZ	237	Aberdeen Dyce Airport	Aberdeen	United Kingdom
ACA	107	General Juan N Alvarez International Airport	Acapulco	Mexico
ACC	1	Kotoka International Airport	Accra	Ghana
ACD	69	Alcides Fernández Airport	Acandi	Colombia
ACE	202	Lanzarote Airport	Arrecife	Spain
ACF	209	Brisbane Archerfield Airport	Brisbane	Australia
ACH	262	St Gallen Altenrhein Airport	Altenrhein	Switzerland
ACI	228	Alderney Airport	Alderney	Guernsey
ACJ	151	Anuradhapura Air Force Base	Anuradhapura	Sri Lanka
ACK	112	Nantucket Memorial Airport	Nantucket	United States
ACN	107	Ciudad Acuña New International Airport	Ciudad Acuna	Mexico
ACP	191	Sahand Airport	Maragheh	Iran
ACR	69	Araracuara Airport	Araracuara	Colombia
ACT	77	Waco Regional Airport	Waco	United States
ACV	102	California Redwood Coast-Humboldt County Airport	Arcata CA	United States
ACX	186	Xingyi Airport	Xingyi	China
ACY	112	Atlantic City International Airport	Atlantic City	United States
ACZ	191	Zabol Airport	Zabol	Iran
ADA	231	Adana Airport	Adana	Turkey
ADB	231	Adnan Menderes International Airport	Izmir	Turkey
ADD	2	Addis Ababa Bole International Airport	Addis Ababa	Ethiopia
ADE	139	Aden International Airport	Aden	Yemen
ADF	231	Adıyaman Airport	Adiyaman	Turkey
ADH	197	Aldan Airport	Aldan	Russia
ADJ	140	Amman-Marka International Airport	Amman	Jordan
ADK	51	Adak Airport	Adak Island	United States
ADL	208	Adelaide International Airport	Adelaide	Australia
ADM	77	Ardmore Municipal Airport	Ardmore	United States
ADP	151	Ampara Airport	Galoya	Sri Lanka
ADQ	52	Kodiak Airport	Kodiak	United States
ADS	77	Addison Airport	Addison	United States
ADT	77	Ada Regional Airport	Ada	United States
ADU	191	Ardabil Airport	Ardabil	Iran
ADW	112	Joint Base Andrews	Camp Springs	United States
ADX	237	RAF Leuchars	Leuchars	United Kingdom
ADY	23	Alldays Airport	Alldays	South Africa
ADZ	69	Gustavo Rojas Pinilla International Airport	San Andres Island	Colombia
AEA	302	Abemama Atoll Airport	Abemama	Kiribati
AEB	186	Baise Youjiang Airport	Baise	China
AEG	161	Aek Godang Airport	Padang Sidempuan	Indonesia
AEH	42	Abeche Airport	Abeche	Chad
AEO	44	Aioun el Atrouss Airport	Aioun El Atrouss	Mauritania
AEP	70	Jorge Newbery Airpark	Buenos Aires	Argentina
AER	243	Sochi International Airport	Sochi	Russia
AES	244	Ålesund Airport	Alesund	Norway
AET	52	Allakaket Airport	Allakaket	United States
AEU	191	Abu Musa Island Airport	Abumusa I.	Iran
AEX	77	Alexandria International Airport	Alexandria	United States
AEY	205	Akureyri Airport	Akureyri	Iceland
AFA	106	Suboficial Ay Santiago Germano Airport	San Rafael	Argentina
AFL	71	Piloto Osvaldo Marques Dias Airport	Alta Floresta	Brazil
AFS	184	Sugraly Airport	Zarafshan	Uzbekistan
AFT	283	Afutara Aerodrome	Afutara	Solomon Islands
AFW	77	Fort Worth Alliance Airport	Fort Worth	United States
AFY	231	Afyon Airport	Afyon	Turkey
AFZ	191	Sabzevar National Airport	Sabzevar	Iran
AGA	13	Al Massira Airport	Agadir	Morocco
AGB	219	Augsburg Airport	Augsburg	Germany
AGC	112	Allegheny County Airport	Pittsburgh	United States
AGE	219	Wangerooge Airport	Wangerooge	Germany
AGF	245	Agen-La Garenne Airport	Agen	France
AGH	255	Ängelholm-Helsingborg Airport	Ängelholm	Sweden
AGI	114	Wageningen Airstrip	Wageningen	Suriname
AGJ	193	Aguni Airport	Aguni	Japan
AGN	52	Angoon Seaplane Base	Angoon	United States
AGP	239	Málaga Airport	Malaga	Spain
AGQ	217	Agrinion Air Base	Agrinion	Greece
AGR	150	Agra Airport	Agra	India
AGS	112	Augusta Regional At Bush Field	Bush Field	United States
AGT	63	Guarani International Airport	Ciudad del Este	Paraguay
AGU	107	Jesús Terán Paredo International Airport	Aguascalientes	Mexico
AGV	73	Oswaldo Guevara Mujica Airport	Acarigua	Venezuela
AGX	150	Agatti Airport	Agatti Island	India
AGZ	23	Aggeneys Airport	Aggeneys	South Africa
AHB	182	Abha Regional Airport	Abha	Saudi Arabia
AHE	301	Ahe Airport	Ahe	French Polynesia
AHN	112	Athens Ben Epps Airport	Athens	United States
AHO	249	Alghero-Fertilia Airport	Alghero	Italy
AHS	130	Ahuas Airport	Ahuas	Honduras
AHU	13	Cherif Al Idrissi Airport	Al Hociema	Morocco
AIA	83	Alliance Municipal Airport	Alliance	United States
AIK	112	Aiken Regional Airport	Aiken	United States
AIN	52	Wainwright Airport	Wainwright	United States
AIS	302	Arorae Island Airport	Arorae	Kiribati
AIT	299	Aitutaki Airport	Aitutaki	Cook Islands
AIU	299	Enua Airport	Atiu Island	Cook Islands
AIZ	77	Lee C Fine Memorial Airport	Kaiser Lake Ozark	United States
AJA	245	Ajaccio-Napoléon Bonaparte Airport	Ajaccio	France
AJF	182	Al-Jawf Domestic Airport	Al-Jawf	Saudi Arabia
AJI	231	Ağrı Airport	Agri	Turkey
AJK	191	Arak Airport	Arak	Iran
AJL	150	Lengpui Airport	Aizwal	India
AJN	267	Ouani Airport	Anjouan	Comoros
AJR	255	Arvidsjaur Airport	Arvidsjaur	Sweden
AJU	87	Santa Maria Airport	Aracaju	Brazil
AJY	43	Mano Dayak International Airport	Agadez	Niger
AKA	186	Ankang Wulipu Airport	Ankang	China
AKB	51	Atka Airport	Atka	United States
AKC	112	Akron Fulton International Airport	Akron	United States
AKD	150	Akola Airport	Akola	India
AKF	48	Kufra Airport	Kufra	Libya
AKH	182	Prince Sultan Air Base	Al Kharj	Saudi Arabia
AKI	52	Akiak Airport	Akiak	United States
AKJ	193	Asahikawa Airport	Asahikawa	Japan
AKK	52	Akhiok Airport	Akhiok	United States
AKL	274	Auckland International Airport	Auckland	New Zealand
AKN	52	King Salmon Airport	King Salmon	United States
AKO	83	Colorado Plains Regional Airport	Akron	United States
AKP	52	Anaktuvuk Pass Airport	Anaktuvuk Pass	United States
AKR	29	Akure Airport	Akure	Nigeria
AKS	283	Gwaunaru'u Airport	Auki	Solomon Islands
AKT	237	RAF Akrotiri	Akrotiri	Cyprus
AKU	186	Aksu Airport	Aksu	China
AKV	133	Akulivik Airport	Akulivik	Canada
AKW	191	Aghajari Airport	Aghajari	Iran
AKX	176	Aktobe Airport	Aktyubinsk	Kazakhstan
AKY	181	Sittwe Airport	Sittwe	Burma
ALA	180	Almaty Airport	Alma-ata	Kazakhstan
ALB	112	Albany International Airport	Albany	United States
ALC	239	Alicante International Airport	Alicante	Spain
ALF	244	Alta Airport	Alta	Norway
ALG	3	Houari Boumediene Airport	Algier	Algeria
ALH	214	Albany Airport	Albany	Australia
ALI	77	Alice International Airport	Alice	United States
ALJ	23	Alexander Bay Airport	Alexander Bay	South Africa
ALL	249	Villanova D'Albenga International Airport	Albenga	Italy
ALM	83	Alamogordo White Sands Regional Airport	Alamogordo	United States
ALO	77	Waterloo Regional Airport	Waterloo	United States
ALP	152	Aleppo International Airport	Aleppo	Syria
ALR	274	Alexandra Airport	Alexandra	New Zealand
ALS	83	San Luis Valley Regional Bergman Field	Alamosa	United States
ALU	39	Alula Airport	Alula	Somalia
ALW	102	Walla Walla Regional Airport	Walla Walla	United States
ALY	12	El Nouzha Airport	Alexandria	Egypt
AMA	77	Rick Husband Amarillo International Airport	Amarillo	United States
AMB	263	Ambilobe Airport	Ambilobe	Madagascar
AMC	42	Am Timan Airport	Am Timan	Chad
AMD	150	Sardar Vallabhbhai Patel International Airport	Ahmedabad	India
AMH	2	Arba Minch Airport	Arba Minch	Ethiopia
AMI	171	Selaparang Airport	Mataram	Indonesia
AMM	140	Queen Alia International Airport	Amman	Jordan
AMQ	162	Pattimura Airport, Ambon	Ambon	Indonesia
AMS	216	Amsterdam Airport Schiphol	Amsterdam	Netherlands
AMV	243	Amderma Airport	Amderma	Russia
AMZ	274	Ardmore Airport	Ardmore	New Zealand
ANB	77	Anniston Regional Airport	Anniston	United States
ANC	52	Ted Stevens Anchorage International Airport	Anchorage	United States
AND	112	Anderson Regional Airport	Andersen	United States
ANE	245	Angers-Loire Airport	Angers/Marcé	France
ANF	121	Andrés Sabella Gálvez International Airport	Antofagasta	Chile
ANG	245	Angoulême-Brie-Champniers Airport	Angouleme	France
ANI	52	Aniak Airport	Aniak	United States
ANK	231	Etimesgut Air Base	Ankara	Turkey
ANM	263	Antsirabato Airport	Antalaha	Madagascar
ANN	52	Annette Island Airport	Annette Island	United States
ANP	112	Lee Airport	Annapolis	United States
ANQ	112	Tri State Steuben County Airport	Angola	United States
ANR	221	Antwerp International Airport (Deurne)	Antwerp	Belgium
ANS	101	Andahuaylas Airport	Andahuaylas	Peru
ANU	54	V.C. Bird International Airport	Antigua	Antigua and Barbuda
ANV	52	Anvik Airport	Anvik	United States
ANX	244	Andøya Airport	Andoya	Norway
AOC	219	Altenburg-Nobitz Airport	Altenburg	Germany
AOE	231	Anadolu Airport	Eskissehir	Turkey
AOG	186	Anshan Air Base	Anshan	China
AOH	112	Lima Allen County Airport	Lima	United States
AOI	249	Ancona Falconara Airport	Ancona	Italy
AOJ	193	Aomori Airport	Aomori	Japan
AOK	217	Karpathos Airport	Karpathos	Greece
AOL	79	Paso De Los Libres Airport	Paso De Los Libres	Argentina
AOO	112	Altoona Blair County Airport	Altoona	United States
AOP	101	Alferez FAP Alfredo Vladimir Sara Bauer Airport	Andoas	Peru
AOR	168	Sultan Abdul Halim Airport	Alor Setar	Malaysia
AOT	249	Aosta Airport	Aosta	Italy
APA	83	Centennial Airport	Denver	United States
APC	102	Napa County Airport	Napa	United States
APF	112	Naples Municipal Airport	Naples	United States
APG	112	Phillips Army Air Field	Aberdeen	United States
APK	301	Apataki Airport	Apataki	French Polynesia
APL	36	Nampula Airport	Nampula	Mozambique
APN	112	Alpena County Regional Airport	Alpena	United States
APO	69	Antonio Roldan Betancourt Airport	Carepa	Colombia
APW	273	Faleolo International Airport	Faleolo	Samoa
APZ	57	Zapala Airport	ZAPALA	Argentina
AQA	123	Araraquara Airport	Araracuara	Brazil
AQB	92	Santa Cruz del Quiche Airport	Santa Cruz des Quiche	Guatemala
AQG	186	Anqing Tianzhushan Airport	Anqing	China
AQI	182	Al Qaisumah/Hafr Al Batin Airport	Hafr Al-batin	Saudi Arabia
AQJ	140	Aqaba King Hussein International Airport	Aqaba	Jordan
AQP	101	Rodríguez Ballón International Airport	Arequipa	Peru
ARA	77	Acadiana Regional Airport	Louisiana	United States
ARB	112	Ann Arbor Municipal Airport	Ann Arbor	United States
ARC	52	Arctic Village Airport	Arctic Village	United States
ARD	171	Mali Airport	Alor Island	Indonesia
ARE	118	Antonio Nery Juarbe Pol Airport	Arecibo	Puerto Rico
ARH	243	Talagi Airport	Arkhangelsk	Russia
ARI	121	Chacalluta Airport	Arica	Chile
ARK	16	Arusha Airport	Arusha	Tanzania
ARM	215	Armidale Airport	Armidale	Australia
ARN	255	Stockholm-Arlanda Airport	Stockholm	Sweden
ARR	74	D. Casimiro Szlapelis Airport	Alto Rio Senguer	Argentina
ART	112	Watertown International Airport	Watertown	United States
ARU	123	Araçatuba Airport	Aracatuba	Brazil
ARV	77	Lakeland-Noble F. Lee Memorial field	Minocqua - Woodruff	United States
ARW	222	Arad International Airport	Arad	Romania
ASA	4	Assab International Airport	Assab	Eritrea
ASB	142	Ashgabat International Airport	Ashkhabad	Turkmenistan
ASD	111	Andros Town Airport	Andros Town	Bahamas
ASE	83	Aspen-Pitkin Co/Sardy Field	Aspen	United States
ASF	250	Astrakhan Airport	Astrakhan	Russia
ASH	112	Boire Field	Nashua	United States
ASI	206	RAF Ascension Island	Wide Awake	Saint Helena
ASJ	193	Amami Airport	Amami	Japan
ASK	0	Yamoussoukro Airport	Yamoussoukro	Cote d'Ivoire
ASM	4	Asmara International Airport	Asmara	Eritrea
ASO	2	Asosa Airport	Asosa	Ethiopia
ASP	210	Alice Springs Airport	Alice Springs	Australia
ASR	231	Kayseri Erkilet Airport	Kayseri	Turkey
AST	102	Astoria Regional Airport	Astoria	United States
ASU	63	Silvio Pettirossi International Airport	Asuncion	Paraguay
ASV	41	Amboseli Airport	Amboseli National Park	Kenya
ASW	12	Aswan International Airport	Aswan	Egypt
ATA	101	Comandante FAP German Arias Graziani Airport	Anta	Peru
ATB	26	Atbara Airport	Atbara	Sudan
ATC	111	Arthur's Town Airport	Arthur's Town	Bahamas
ATD	283	Uru Harbour Airport	Atoifi	Solomon Islands
ATF	93	Chachoán Airport	Ambato	Ecuador
ATH	217	Eleftherios Venizelos International Airport	Athens	Greece
ATJ	263	Antsirabe Airport	Antsirabe	Madagascar
ATK	52	Atqasuk Edward Burnell Sr Memorial Airport	Atqasuk	United States
ATL	112	Hartsfield Jackson Atlanta International Airport	Atlanta	United States
ATM	65	Altamira Airport	Altamira	Brazil
ATO	112	Ohio University Snyder Field	Athens	United States
ATQ	150	Sri Guru Ram Dass Jee International Airport	Amritsar	India
ATR	44	Atar International Airport	Atar	Mauritania
ATW	77	Appleton International Airport	Appleton	United States
ATY	77	Watertown Regional Airport	Watertown	United States
ATZ	12	Assiut International Airport	Asyut	Egypt
AUA	62	Queen Beatrix International Airport	Oranjestad	Aruba
AUC	69	Santiago Perez Airport	Arauca	Colombia
AUF	245	Auxerre-Branches Airport	Auxerre	France
AUG	112	Augusta State Airport	Augusta	United States
AUH	155	Abu Dhabi International Airport	Abu Dhabi	United Arab Emirates
AUK	52	Alakanuk Airport	Alakanuk	United States
AUO	77	Auburn University Regional Airport	Auburn	United States
AUQ	289	Hiva Oa-Atuona Airport	Hiva-oa	French Polynesia
AUR	245	Aurillac Airport	Aurillac	France
AUS	77	Austin Bergstrom International Airport	Austin	United States
AUU	209	Aurukun Airport	Aurukun	Australia
AUW	77	Wausau Downtown Airport	Wausau	United States
AUX	87	Araguaína Airport	Araguaina	Brazil
AUY	277	Aneityum Airport	Anelghowhat	Vanuatu
AVA	186	Anshun Huangguoshu Airport	Anshun	China
AVB	249	Aviano Air Base	Aviano	Italy
AVI	96	Maximo Gomez Airport	Ciego De Avila	Cuba
AVK	194	Arvaikheer Airport	Arvaikheer	Mongolia
AVL	112	Asheville Regional Airport	Asheville	United States
AVN	245	Avignon-Caumont Airport	Avignon	France
AVO	112	Avon Park Executive Airport	Avon Park	United States
AVP	112	Wilkes Barre Scranton International Airport	Scranton	United States
AVR	235	Alverca Air Base	Alverca	Portugal
AVV	211	Avalon Airport	Avalon	Australia
AVW	115	Marana Regional Airport	Tucson	United States
AVX	102	Catalina Airport	Catalina Island	United States
AWA	2	Awassa Airport	Awasa	Ethiopia
AWD	277	Aniwa Airport	Aniwa	Vanuatu
AWK	286	Wake Island Airfield	Wake island	Wake Island
AWZ	191	Ahwaz Airport	Ahwaz	Iran
AXA	53	Clayton J Lloyd International Airport	The Valley	Anguilla
AXD	217	Dimokritos Airport	Alexandroupolis	Greece
AXJ	193	Amakusa Airport	Amakusa	Japan
AXK	139	Ataq Airport	Ataq	Yemen
AXM	69	El Eden Airport	Armenia	Colombia
AXP	111	Spring Point Airport	Spring Point	Bahamas
AXR	301	Arutua Airport	Arutua	French Polynesia
AXT	193	Akita Airport	Akita	Japan
AXU	2	Axum Airport	Axum	Ethiopia
AYK	180	Arkalyk North Airport	Arkalyk	Kazakhstan
AYO	63	Juan De Ayolas Airport	Ayolas	Paraguay
AYP	101	Coronel FAP Alfredo Mendivil Duarte Airport	Ayacucho	Peru
AYQ	210	Ayers Rock Connellan Airport	Uluru	Australia
AYT	231	Antalya International Airport	Antalya	Turkey
AZA	115	Phoenix-Mesa-Gateway Airport	Mesa	United States
AZD	191	Shahid Sadooghi Airport	Yazd	Iran
AZI	155	Bateen Airport	Abu Dhabi	United Arab Emirates
AZN	184	Andizhan Airport	Andizhan	Uzbekistan
AZO	112	Kalamazoo Battle Creek International Airport	Kalamazoo	United States
AZR	3	Touat Cheikh Sidi Mohamed Belkebir Airport	Adrar	Algeria
AZS	122	Samaná El Catey International Airport	Samana	Dominican Republic
BAB	102	Beale Air Force Base	Marysville	United States
BAD	77	Barksdale Air Force Base	Shreveport	United States
BAF	112	Westfield-Barnes Regional Airport	Westfield	United States
BAG	172	Loakan Airport	Baguio	Philippines
BAH	144	Bahrain International Airport	Bahrain	Bahrain
BAI	80	Buenos Aires Airport	Buenos Aires	Costa Rica
BAL	231	Batman Airport	Batman	Turkey
BAQ	69	Ernesto Cortissoz International Airport	Barranquilla	Colombia
BAS	283	Ballalae Airport	Ballalae	Solomon Islands
BAU	123	Bauru Airport	Bauru	Brazil
BAV	186	Baotou Airport	Baotou	China
BAX	167	Barnaul Airport	Barnaul	Russia
BAY	222	Tautii Magheraus Airport	Baia Mare	Romania
BAZ	68	Barcelos Airport	Barcelos	Brazil
BBA	121	Balmaceda Airport	Balmaceda	Chile
BBG	302	Butaritari Atoll Airport	Butaritari	Kiribati
BBH	219	Barth Airport	Barth	Germany
BBI	150	Biju Patnaik Airport	Bhubaneswar	India
BBJ	219	Bitburg Airport	Birburg	Germany
BBK	21	Kasane Airport	Kasane	Botswana
BBL	209	Ballera Airport	Ballera	Australia
BBM	177	Battambang Airport	Battambang	Cambodia
BBN	168	Bario Airport	Bario	Malaysia
BBO	39	Berbera Airport	Berbera	Somalia
BBP	237	Bembridge Airport	Bembridge	United Kingdom
BBQ	54	Codrington Airport	Codrington	Antigua and Barbuda
BBR	91	Baillif Airport	Basse Terre	Guadeloupe
BBS	237	Blackbushe Airport	Blackbushe	United Kingdom
BBT	6	Berbérati Airport	Berberati	Central African Republic
BBU	222	Băneasa International Airport	Bucharest	Romania
BBX	112	Wings Field	Philadelphia	United States
BCA	96	Gustavo Rizo Airport	Baracoa Playa	Cuba
BCD	172	Bacolod-Silay Airport	Bacolod	Philippines
BCE	83	Bryce Canyon Airport	Bryce Canyon	United States
BCH	154	Cakung Airport	Baucau	East Timor
BCI	209	Barcaldine Airport	Barcaldine	Australia
BCL	80	Barra del Colorado Airport	Pococi	Costa Rica
BCM	222	Bacău Airport	Bacau	Romania
BCN	239	Barcelona International Airport	Barcelona	Spain
BCO	2	Baco Airport	Baco	Ethiopia
BCT	112	Boca Raton Airport	Boca Raton	United States
BDA	201	L.F. Wade International International Airport	Bermuda	Bermuda
BDB	209	Bundaberg Airport	Bundaberg	Australia
BDD	209	Badu Island Airport	Badu Island	Australia
BDE	77	Baudette International Airport	Baudette	United States
BDH	191	Bandar Lengeh Airport	Bandar Lengeh	Iran
BDJ	171	Syamsudin Noor Airport	Banjarmasin	Indonesia
BDL	112	Bradley International Airport	Windsor Locks	United States
BDM	231	Bandırma Airport	Bandirma	Turkey
BDN	165	Talhar Airport	Talhar	Pakistan
BDO	161	Husein Sastranegara International Airport	Bandung	Indonesia
BDP	166	Bhadrapur Airport	Chandragarhi	Nepal
BDQ	150	Vadodara Airport	Baroda	India
BDR	112	Igor I Sikorsky Memorial Airport	Stratford	United States
BDS	249	Brindisi – Salento Airport	Brindisi	Italy
BDT	28	Gbadolite Airport	Gbadolite	Congo (Kinshasa)
BDU	244	Bardufoss Airport	Bardufoss	Norway
BEB	237	Benbecula Airport	Benbecula	United Kingdom
BEC	77	Beech Factory Airport	Wichita	United States
BED	112	Laurence G Hanscom Field	Bedford	United States
BEF	103	Bluefields Airport	Bluefields	Nicaragua
BEG	218	Belgrade Nikola Tesla Airport	Belgrade	Serbia
BEI	2	Beica Airport	Beica	Ethiopia
BEJ	171	Kalimarau Airport	Tanjung Redep-Borneo Island	Indonesia
BEK	150	Bareilly Air Force Station	Bareilly	India
BEL	65	Val de Cans/Júlio Cezar Ribeiro International Airport	Belem	Brazil
BEM	13	Beni Mellal Airport	Beni Mellal	Morocco
BEN	48	Benina International Airport	Benghazi	Libya
BEO	215	Lake Macquarie Airport	Lake Macquarie	Australia
BEP	150	Bellary Airport	Bellary	India
BEQ	237	RAF Honington	Honington	United Kingdom
BES	245	Brest Bretagne Airport	Brest	France
BET	52	Bethel Airport	Bethel	United States
BEU	209	Bedourie Airport	Bedourie	Australia
BEV	163	Beersheba (Teyman) Airport	Beer-sheba	Israel
BEW	36	Beira Airport	Beira	Mozambique
BEX	237	RAF Benson	Benson	United Kingdom
BEY	147	Beirut Rafic Hariri International Airport	Beirut	Lebanon
BEZ	302	Beru Airport	Beru Island	Kiribati
BFD	112	Bradford Regional Airport	Bradford	United States
BFE	219	Bielefeld Airport	Bielefeld	Germany
BFF	83	Western Neb. Rgnl/William B. Heilig Airport	Scottsbluff	United States
BFH	123	Bacacheri Airport	Curitiba	Brazil
BFI	102	Boeing Field King County International Airport	Seattle	United States
BFJ	186	Bijie Feixiong Airport	Bijie	China
BFK	83	Buckley Air Force Base	Buckley	United States
BFL	102	Meadows Field	Bakersfield	United States
BFM	77	Mobile Downtown Airport	Mobile	United States
BFN	23	Bram Fischer International Airport	Bloemfontein	South Africa
BFO	22	Buffalo Range Airport	Chiredzi	Zimbabwe
BFP	112	Beaver County Airport	Beaver Falls	United States
BFS	237	Belfast International Airport	Belfast	United Kingdom
BFT	112	Beaufort County Airport	Beaufort	United States
BFV	146	Buri Ram Airport	Buri Ram	Thailand
BFW	3	Sidi Bel Abbes Airport	Sidi Bel Abbes	Algeria
BFX	18	Bafoussam Airport	Bafoussam	Cameroon
BGA	69	Palonegro Airport	Bucaramanga	Colombia
BGC	235	Bragança Airport	Braganca	Portugal
BGE	112	Decatur County Industrial Air Park	Bainbridge	United States
BGF	6	Bangui M'Poko International Airport	Bangui	Central African Republic
BGG	231	Bingöl Çeltiksuyu Airport	Bingol	Turkey
BGI	64	Sir Grantley Adams International Airport	Bridgetown	Barbados
BGM	112	Greater Binghamton/Edwin A Link field	Binghamton	United States
BGO	244	Bergen Airport Flesland	Bergen	Norway
BGR	112	Bangor International Airport	Bangor	United States
BGW	143	Baghdad International Airport	Baghdad	Iraq
BGX	123	Comandante Gustavo Kraemer Airport	Bage	Brazil
BGY	249	Il Caravaggio International Airport	Bergamo	Italy
BGZ	235	Braga Municipal Aerodrome	Braga	Portugal
BHB	112	Hancock County-Bar Harbor Airport	Bar Harbor	United States
BHD	237	George Best Belfast City Airport	Belfast	United Kingdom
BHE	274	Woodbourne Airport	Woodbourne	New Zealand
BHG	130	Brus Laguna Airport	Brus Laguna	Honduras
BHH	182	Bisha Airport	Bisha	Saudi Arabia
BHI	70	Comandante Espora Airport	Bahia Blanca	Argentina
BHJ	150	Bhuj Airport	Bhuj	India
BHK	184	Bukhara Airport	Bukhara	Uzbekistan
BHM	77	Birmingham-Shuttlesworth International Airport	Birmingham	United States
BHN	139	Beihan Airport	Beihan	Yemen
BHO	150	Raja Bhoj International Airport	Bhopal	India
BHP	166	Bhojpur Airport	Bhojpur	Nepal
BHQ	208	Broken Hill Airport	Broken Hill	Australia
BHR	166	Bharatpur Airport	Bharatpur	Nepal
BHS	215	Bathurst Airport	Bathurst	Australia
BHU	150	Bhavnagar Airport	Bhaunagar	India
BHV	165	Bahawalpur Airport	Bahawalpur	Pakistan
BHW	165	Bhagatanwala Airport	Bhagtanwala	Pakistan
BHX	237	Birmingham International Airport	Birmingham	United Kingdom
BHY	186	Beihai Airport	Beihai	China
BIA	245	Bastia-Poretta Airport	Bastia	France
BID	112	Block Island State Airport	Block Island	United States
BIF	83	Biggs Army Air Field (Fort Bliss)	El Paso	United States
BIG	52	Allen Army Airfield	Delta Junction	United States
BIK	162	Frans Kaisiepo Airport	Biak	Indonesia
BIL	83	Billings Logan International Airport	Billings	United States
BIM	111	South Bimini Airport	Alice Town	Bahamas
BIN	164	Bamiyan Airport	Bamyan	Afghanistan
BIO	239	Bilbao Airport	Bilbao	Spain
BIQ	245	Biarritz-Anglet-Bayonne Airport	Biarritz-bayonne	France
BIR	166	Biratnagar Airport	Biratnagar	Nepal
BIS	77	Bismarck Municipal Airport	Bismarck	United States
BIU	205	Bildudalur Airport	Bildudalur	Iceland
BIX	77	Keesler Air Force Base	Biloxi	United States
BIY	23	Bisho Airport	Bisho	South Africa
BJA	3	Soummam Airport	Bejaja	Algeria
BJB	191	Bojnord Airport	Bojnourd	Iran
BJC	83	Rocky Mountain Metropolitan Airport	Broomfield-CO	United States
BJF	244	Båtsfjord Airport	Batsfjord	Norway
BJH	166	Bajhang Airport	Bajhang	Nepal
BJI	77	Bemidji Regional Airport	Bemidji	United States
BJL	7	Banjul International Airport	Banjul	Gambia
BJM	11	Bujumbura International Airport	Bujumbura	Burundi
BJO	100	Bermejo Airport	Bermejo	Bolivia
BJP	123	Estadual Arthur Siqueira Airport	Braganca Paulista	Brazil
BJR	2	Bahir Dar Airport	Bahar Dar	Ethiopia
BJU	166	Bajura Airport	Bajura	Nepal
BJV	231	Milas Bodrum International Airport	Bodrum	Turkey
BJX	107	Del Bajío International Airport	Del Bajio	Mexico
BJZ	239	Badajoz Airport	Badajoz	Spain
BKA	243	Bykovo Airport	Moscow	Russia
BKB	150	Nal Airport	Bikaner	India
BKC	52	Buckland Airport	Buckland	United States
BKD	77	Stephens County Airport	Breckenridge	United States
BKG	77	Branson Airport	Branson	United States
BKH	285	Barking Sands Airport	Barking Sands	United States
BKI	168	Kota Kinabalu International Airport	Kota Kinabalu	Malaysia
BKK	146	Suvarnabhumi Airport	Bangkok	Thailand
BKL	112	Burke Lakefront Airport	Cleveland	United States
BKM	168	Bakalalan Airport	Bakalalan	Malaysia
BKO	5	Modibo Keita International Airport	Bamako	Mali
BKQ	209	Blackall Airport	Blackall	Australia
BKS	161	Fatmawati Soekarno Airport	Bengkulu	Indonesia
BKW	112	Raleigh County Memorial Airport	Beckley	United States
BKY	33	Bukavu Kavumu Airport	Bukavu/kavumu	Congo (Kinshasa)
BKZ	16	Bukoba Airport	Bukoba	Tanzania
BLA	73	General José Antonio Anzoategui International Airport	Barcelona	Venezuela
BLB	113	Panama Pacific International Airport	Howard	Panama
BLE	255	Borlange Airport	Borlange	Sweden
BLF	112	Mercer County Airport	Bluefield	United States
BLG	168	Belaga Airport	Belaga	Malaysia
BLH	102	Blythe Airport	Blythe	United States
BLI	102	Bellingham International Airport	Bellingham	United States
BLJ	3	Batna Airport	Batna	Algeria
BLK	237	Blackpool International Airport	Blackpool	United Kingdom
BLL	225	Billund Airport	Billund	Denmark
BLQ	249	Bologna Guglielmo Marconi Airport	Bologna	Italy
BLR	150	Kempegowda International Airport	Bangalore	India
BLT	209	Blackwater Airport	Blackwater	Australia
BLV	77	Scott AFB/Midamerica Airport	Belleville	United States
BLZ	9	Chileka International Airport	Blantyre	Malawi
BMA	255	Stockholm-Bromma Airport	Stockholm	Sweden
BMC	83	Brigham City Regional Airport	Brigham City	United States
BMD	263	Belo sur Tsiribihina Airport	Belo sur Tsiribihina	Madagascar
BME	214	Broome International Airport	Broome	Australia
BMG	112	Monroe County Airport	Bloomington	United States
BMI	77	Central Illinois Regional Airport at Bloomington-Normal	Bloomington	United States
BMK	219	Borkum Airport	Borkum	Germany
BMM	30	Bitam Airport	Bitam	Gabon
BMO	181	Banmaw Airport	Banmaw	Burma
BMP	209	Brampton Island Airport	Brampton Island	Australia
BMT	77	Beaumont Municipal Airport	Beaumont	United States
BMU	171	Muhammad Salahuddin Airport	Bima	Indonesia
BMV	183	Buon Ma Thuot Airport	Buonmethuot	Vietnam
BMW	3	Bordj Badji Mokhtar Airport	Bordj Badji Mokhtar	Algeria
BMX	52	Big Mountain Airport	Big Mountain	United States
BMY	294	Île Art - Waala Airport	Waala	New Caledonia
BNA	77	Nashville International Airport	Nashville	United States
BND	191	Bandar Abbas International Airport	Bandar Abbas	Iran
BNE	209	Brisbane International Airport	Brisbane	Australia
BNI	29	Benin Airport	Benin	Nigeria
BNK	215	Ballina Byron Gateway Airport	Ballina Byron Bay	Australia
BNN	244	Brønnøysund Airport	Bronnoysund	Norway
BNO	102	Burns Municipal Airport	Burns	United States
BNP	165	Bannu Airport	Bannu	Pakistan
BNS	73	Barinas Airport	Barinas	Venezuela
BNU	123	Blumenau Airport	BLUMENAU	Brazil
BNX	251	Banja Luka International Airport	Banja Luka	Bosnia and Herzegovina
BOA	28	Boma Airport	Boma	Congo (Kinshasa)
BOB	301	Bora Bora Airport	Bora Bora	French Polynesia
BOC	113	Bocas Del Toro International Airport	Bocas Del Toro	Panama
BOD	245	Bordeaux-Mérignac Airport	Bordeaux	France
BOG	69	El Dorado International Airport	Bogota	Colombia
BOH	237	Bournemouth Airport	Bournemouth	United Kingdom
BOI	83	Boise Air Terminal/Gowen Field	Boise	United States
BOJ	254	Burgas Airport	Bourgas	Bulgaria
BOM	150	Chhatrapati Shivaji International Airport	Mumbai	India
BON	81	Flamingo International Airport	Kralendijk	Netherlands Antilles
BOO	244	Bodø Airport	Bodo	Norway
BOR	245	Fontaine Airport	Belfort	France
BOS	112	General Edward Lawrence Logan International Airport	Boston	United States
BOU	245	Bourges Airport	Bourges	France
BOW	112	Bartow Municipal Airport	Bartow	United States
BOY	45	Bobo Dioulasso Airport	Bobo-dioulasso	Burkina Faso
BPC	18	Bamenda Airport	Bamenda	Cameroon
BPE	186	Qinhuangdao Beidaihe Airport	Bagan	Burma
BPF	283	Batuna Aerodrome	Batuna	Solomon Islands
BPG	71	Barra do Garças Airport	Barra Do Garcas	Brazil
BPM	150	Begumpet Airport	Hyderabad	India
BPN	171	Sultan Aji Muhamad Sulaiman Airport	Balikpapan	Indonesia
BPS	87	Porto Seguro Airport	Porto Seguro	Brazil
BPT	77	Southeast Texas Regional Airport	Beaumont	United States
BPX	186	Qamdo Bangda Airport	Bangda	China
BPY	263	Besalampy Airport	Besalampy	Madagascar
BQA	172	Dr.Juan C. Angara Airport	Baler	Philippines
BQB	214	Busselton Regional Airport	Brusselton	Australia
BQH	237	London Biggin Hill Airport	Biggin Hill	United Kingdom
BQJ	196	Batagay Airport	Batagay	Russia
BQK	112	Brunswick Golden Isles Airport	Brunswick	United States
BQL	209	Boulia Airport	Boulia	Australia
BQN	118	Rafael Hernandez Airport	Aguadilla	Puerto Rico
BQS	197	Ignatyevo Airport	Blagoveschensk	Russia
BQT	242	Brest Airport	Brest	Belarus
BQU	129	J F Mitchell Airport	Bequia	Saint Vincent and the Grenadines
BRA	87	Barreiras Airport	Barreiras	Brazil
BRC	57	San Carlos De Bariloche Airport	San Carlos De Bariloche	Argentina
BRD	77	Brainerd Lakes Regional Airport	Brainerd	United States
BRE	219	Bremen Airport	Bremen	Germany
BRI	249	Bari Karol Wojtyła Airport	Bari	Italy
BRK	215	Bourke Airport	Bourke	Australia
BRL	77	Southeast Iowa Regional Airport	Burlington	United States
BRM	73	Barquisimeto International Airport	Barquisimeto	Venezuela
BRN	262	Bern Belp Airport	Bern	Switzerland
BRO	77	Brownsville South Padre Island International Airport	Brownsville	United States
BRQ	247	Brno-Tuřany Airport	Brno	Czech Republic
BRR	237	Barra Airport	Barra	United Kingdom
BRS	237	Bristol Airport	Bristol	United Kingdom
BRT	210	Bathurst Island Airport	Bathurst Island	Australia
BRU	221	Brussels Airport	Brussels	Belgium
BRV	219	Bremerhaven Airport	Bremerhaven	Germany
BRW	52	Wiley Post Will Rogers Memorial Airport	Barrow	United States
BRX	122	Maria Montez International Airport	Barahona	Dominican Republic
BSA	39	Bosaso Airport	Bosaso	Somalia
BSB	123	Presidente Juscelino Kubistschek International Airport	Brasilia	Brazil
BSC	69	José Celestino Mutis Airport	Bahia Solano	Colombia
BSD	186	Baoshan Yunduan Airport	Baoshan	China
BSF	285	Bradshaw Army Airfield	Bradshaw Field	United States
BSG	35	Bata Airport	Bata	Equatorial Guinea
BSJ	211	Bairnsdale Airport	Bairnsdale	Australia
BSK	3	Biskra Airport	Biskra	Algeria
BSL	245	EuroAirport Basel-Mulhouse-Freiburg Airport	Mulhouse	France
BSR	143	Basrah International Airport	Basrah	Iraq
BST	164	Bost Airport	Lashkar Gah	Afghanistan
BSU	28	Basankusu Airport	Basankusu	Congo (Kinshasa)
BSX	181	Pathein Airport	Pathein	Burma
BTC	151	Batticaloa Airport	Batticaloa	Sri Lanka
BTE	20	Sherbro International Airport	Bonthe	Sierra Leone
BTH	161	Hang Nadim International Airport	Batam	Indonesia
BTI	52	Barter Island LRRS Airport	Barter Island	United States
BTJ	161	Sultan Iskandar Muda International Airport	Banda Aceh	Indonesia
BTK	160	Bratsk Airport	Bratsk	Russia
BTM	83	Bert Mooney Airport	Butte	United States
BTR	77	Baton Rouge Metropolitan Airport	Baton Rouge	United States
BTS	220	M. R. Štefánik Airport	Bratislava	Slovakia
BTT	52	Bettles Airport	Bettles	United States
BTU	168	Bintulu Airport	Bintulu	Malaysia
BTV	112	Burlington International Airport	Burlington	United States
BTW	171	Batu Licin Airport	Batu Licin	Indonesia
BTZ	231	Bursa Airport	Bursa	Turkey
BUA	298	Buka Airport	Buka Island	Papua New Guinea
BUC	209	Burketown Airport	Burketown	Australia
BUD	223	Budapest Liszt Ferenc International Airport	Budapest	Hungary
BUF	112	Buffalo Niagara International Airport	Buffalo	United States
BUG	32	Benguela Airport	Benguela	Angola
BUI	162	Bokondini Airport	Bokondini-Papua Island	Indonesia
BUJ	3	Bou Saada Airport	Bou Saada	Algeria
BUN	69	Gerardo Tobar López Airport	Buenaventura	Colombia
BUO	39	Burao Airport	Burao	Somalia
BUP	150	Bhatinda Air Force Station	Bhatinda	India
BUQ	22	Joshua Mqabuko Nkomo International Airport	Bulawayo	Zimbabwe
BUR	102	Bob Hope Airport	Burbank	United States
BUS	190	Batumi International Airport	Batumi	Georgia
BUX	33	Bunia Airport	Bunia	Congo (Kinshasa)
BUZ	191	Bushehr Airport	Bushehr	Iran
BVA	245	Paris Beauvais Tillé Airport	Beauvais	France
BVB	68	Atlas Brasil Cantanhede Airport	Boa Vista	Brazil
BVC	203	Rabil Airport	Boa Vista	Cape Verde
BVE	245	Brive Souillac Airport	Brive	France
BVG	244	Berlevåg Airport	Berlevag	Norway
BVH	68	Brigadeiro Camarão Airport	Vilhena	Brazil
BVI	209	Birdsville Airport	Birdsville	Australia
BVS	65	Breves Airport	Breves	Brazil
BVY	112	Beverly Municipal Airport	Beverly	United States
BWA	166	Gautam Buddha Airport	Bhairawa	Nepal
BWB	214	Barrow Island Airport	Barrow Island	Australia
BWE	219	Braunschweig-Wolfsburg Airport	Braunschweig	Germany
BWF	237	Barrow Walney Island Airport	Barrow Island	United Kingdom
BWG	77	Bowling Green Warren County Regional Airport	Bowling Green	United States
BWH	168	Butterworth Airport	Butterworth	Malaysia
BWI	112	Baltimore/Washington International Thurgood Marshall Airport	Baltimore	United States
BWK	261	Bol Airport	Brac	Croatia
BWN	149	Brunei International Airport	Bandar Seri Begawan	Brunei
BWO	243	Balakovo Airport	Balakovo	Russia
BWT	213	Wynyard Airport	Burnie	Australia
BWU	215	Sydney Bankstown Airport	Sydney	Australia
BXB	162	Babo Airport	Babo	Indonesia
BXE	15	Bakel Airport	Bakel	Senegal
BXG	211	Bendigo Airport	Bendigo	Australia
BXH	180	Balkhash Airport	Balkhash	Kazakhstan
BXK	115	Buckeye Municipal Airport	Buckeye	United States
BXN	231	Imsık Airport	Bodrum	Turkey
BXO	262	Buochs Airport	Buochs	Switzerland
BXR	191	Bam Airport	Bam	Iran
BXU	172	Bancasi Airport	Butuan	Philippines
BXY	180	Krainiy Airport	Baikonur	Kazakhstan
BYC	100	Yacuiba Airport	Yacuiba	Bolivia
BYF	245	Albert-Bray Airport	Albert	France
BYH	77	Arkansas International Airport	Blytheville	United States
BYJ	235	Beja Airport / Airbase	Beja (madeira)	Portugal
BYK	0	Bouaké Airport	Bouake	Cote d'Ivoire
BYM	96	Carlos Manuel de Cespedes Airport	Bayamo	Cuba
BYN	194	Bayankhongor Airport	Bayankhongor	Mongolia
BYO	71	Bonito Airport	Bointo	Brazil
BYR	225	Læsø Airport	Laeso	Denmark
BYS	102	Bicycle Lake Army Air Field	Fort Irwin	United States
BYT	226	Bantry Aerodrome	Bantry	Ireland
BYU	219	Bayreuth Airport	Bayreuth	Germany
BZA	103	San Pedro Airport	Bonanza	Nicaragua
BZE	66	Philip S. W. Goldson International Airport	Belize City	Belize
BZG	260	Bydgoszcz Ignacy Jan Paderewski Airport	Bydgoszcz	Poland
BZH	22	Bumi Airport	Bumi Hills	Zimbabwe
BZI	231	Balıkesir Merkez Airport	Balikesir	Turkey
BZK	243	Bryansk Airport	Bryansk	Russia
BZL	153	Barisal Airport	Barisal	Bangladesh
BZN	83	Gallatin Field	Bozeman	United States
BZO	249	Bolzano Airport	Bolzano	Italy
BZR	245	Béziers-Vias Airport	Beziers	France
BZU	33	Buta Zega Airport	Buta Zega	Congo (Kinshasa)
BZV	10	Maya-Maya Airport	Brazzaville	Congo (Brazzaville)
BZY	224	Bălți International Airport	Saltsy	Moldova
BZZ	237	RAF Brize Norton	Brize Norton	United Kingdom
CAB	32	Cabinda Airport	Cabinda	Angola
CAC	123	Cascavel Airport	Cascavel	Brazil
CAE	112	Columbia Metropolitan Airport	Columbia	United States
CAF	68	Carauari Airport	Carauari	Brazil
CAG	249	Cagliari Elmas Airport	Cagliari	Italy
CAH	183	Cà Mau Airport	Ca Mau	Vietnam
CAI	12	Cairo International Airport	Cairo	Egypt
CAJ	73	Canaima Airport	Canaima	Venezuela
CAK	112	Akron Canton Regional Airport	Akron	United States
CAL	237	Campbeltown Airport	Campbeltown	United Kingdom
CAN	186	Guangzhou Baiyun International Airport	Guangzhou	China
CAP	116	Cap Haitien International Airport	Cap Haitien	Haiti
CAQ	69	Juan H White Airport	Caucasia	Colombia
CAR	112	Caribou Municipal Airport	Caribou	United States
CAT	235	Cascais Airport	Cascais	Portugal
CAU	87	Caruaru Airport	Caruaru	Brazil
CAW	123	Bartolomeu Lisandro Airport	Campos	Brazil
CAX	237	Carlisle Airport	Carlisle	United Kingdom
CAY	75	Cayenne-Rochambeau Airport	Cayenne	French Guiana
CAZ	215	Cobar Airport	Cobar	Australia
CBB	100	Jorge Wilsterman International Airport	Cochabamba	Bolivia
CBD	150	Car Nicobar Air Force Station	Carnicobar	India
CBE	112	Greater Cumberland Regional Airport	Cumberland	United States
CBG	237	Cambridge Airport	Cambridge	United Kingdom
CBH	3	Béchar Boudghene Ben Ali Lotfi Airport	Béchar	Algeria
CBJ	122	Cabo Rojo Airport	Cabo Rojo	Dominican Republic
CBL	73	Aeropuerto "General Tomas de Heres". Ciudad Bolivar	Ciudad Bolivar	Venezuela
CBM	77	Columbus Air Force Base	Colombus	United States
CBN	161	Penggung Airport	Cirebon	Indonesia
CBO	172	Awang Airport	Cotabato	Philippines
CBQ	29	Margaret Ekpo International Airport	Calabar	Nigeria
CBR	215	Canberra International Airport	Canberra	Australia
CBT	32	Catumbela Airport	Catumbela	Angola
CBU	219	Cottbus-Drewitz Airport	Cottbus	Germany
CBV	92	Coban Airport	Coban	Guatemala
CCA	100	Chimore Airport	Chapacura	Bolivia
CCC	96	Jardines Del Rey Airport	Cunagua	Cuba
CCF	245	Carcassonne Airport	Carcassonne	France
CCH	121	Chile Chico Airport	Chile Chico	Chile
CCI	123	Concórdia Airport	Concordia	Brazil
CCJ	150	Calicut International Airport	Calicut	India
CCK	266	Cocos (Keeling) Islands Airport	Cocos Keeling Island	Cocos (Keeling) Islands
CCL	209	Chinchilla Airport	Chinchilla	Australia
CCM	123	Diomício Freitas Airport	Criciuma	Brazil
CCN	164	Chakcharan Airport	Chaghcharan	Afghanistan
CCP	121	Carriel Sur Airport	Concepcion	Chile
CCR	102	Buchanan Field	Concord	United States
CCS	73	Simón Bolívar International Airport	Caracas	Venezuela
CCU	150	Netaji Subhash Chandra Bose International Airport	Kolkata	India
CCV	277	Craig Cove Airport	Craig Cove	Vanuatu
CCZ	111	Chub Cay Airport	Chub Cay	Bahamas
CDA	210	Cooinda Airport	Cooinda	Australia
CDB	52	Cold Bay Airport	Cold Bay	United States
CDC	83	Cedar City Regional Airport	Cedar City	United States
CDG	245	Charles de Gaulle International Airport	Paris	France
CDJ	65	Conceição do Araguaia Airport	Conceicao Do Araguaia	Brazil
CDN	112	Woodward Field	Camden	United States
CDP	150	Kadapa Airport	Cuddapah	India
CDR	83	Chadron Municipal Airport	Chadron	United States
CDS	77	Childress Municipal Airport	Childress	United States
CDU	215	Camden Airport	Camden	Australia
CDV	52	Merle K (Mudhole) Smith Airport	Cordova	United States
CDW	112	Essex County Airport	Caldwell	United States
CEB	172	Mactan Cebu International Airport	Cebu	Philippines
CEC	102	Jack Mc Namara Field Airport	Crescent City	United States
CED	208	Ceduna Airport	Ceduna	Australia
CEE	243	Cherepovets Airport	Cherepovets	Russia
CEF	112	Westover ARB/Metropolitan Airport	Chicopee Falls	United States
CEG	237	Hawarden Airport	Hawarden	United Kingdom
CEI	146	Chiang Rai International Airport	Chiang Rai	Thailand
CEJ	234	Chernihiv Shestovitsa Airport	Chernigov	Ukraine
CEK	198	Chelyabinsk Balandino Airport	Chelyabinsk	Russia
CEM	52	Central Airport	Central	United States
CEN	97	Ciudad Obregón International Airport	Ciudad Obregon	Mexico
CEQ	245	Cannes-Mandelieu Airport	Cannes	France
CER	245	Cherbourg-Maupertus Airport	Cherbourg	France
CES	215	Cessnock Airport	Cessnock	Australia
CET	245	Cholet Le Pontreau Airport	Cholet	France
CEU	112	Oconee County Regional Airport	Clemson	United States
CEW	77	Bob Sikes Airport	Crestview	United States
CEZ	83	Cortez Municipal Airport	Cortez	United States
CFB	123	Cabo Frio Airport	Cabo Frio	Brazil
CFC	123	Caçador Airport	Cacador	Brazil
CFD	77	Coulter Field	Bryan	United States
CFE	245	Clermont-Ferrand Auvergne Airport	Clermont-Ferrand	France
CFG	96	Jaime Gonzalez Airport	Cienfuegos	Cuba
CFK	3	Ech Cheliff Airport	Ech-cheliff	Algeria
CFN	226	Donegal Airport	Dongloe	Ireland
CFO	71	Confresa Airport	Confresa	Brazil
CFR	245	Caen-Carpiquet Airport	Caen	France
CFS	215	Coffs Harbour Airport	Coff's Harbour	Australia
CFU	217	Ioannis Kapodistrias International Airport	Kerkyra/corfu	Greece
CGB	71	Marechal Rondon Airport	Cuiaba	Brazil
CGD	186	Changde Airport	Changde	China
CGF	112	Cuyahoga County Airport	Richmond Heights	United States
CGH	123	Congonhas Airport	Sao Paulo	Brazil
CGI	77	Cape Girardeau Regional Airport	Cape Girardeau	United States
CGJ	34	Kasompe Airport	Kasompe	Zambia
CGK	161	Soekarno-Hatta International Airport	Jakarta	Indonesia
CGM	172	Camiguin Airport	Camiguin	Philippines
CGN	219	Cologne Bonn Airport	Cologne	Germany
CGO	186	Zhengzhou Xinzheng International Airport	Zhengzhou	China
CGP	153	Shah Amanat International Airport	Chittagong	Bangladesh
CGQ	186	Longjia Airport	Changchun	China
CGR	71	Campo Grande Airport	Campo Grande	Brazil
CGX	77	Chicago Meigs Airport	Chicago	United States
CGZ	115	Casa Grande Municipal Airport	Casa Grande	United States
CHA	112	Lovell Field	Chattanooga	United States
CHC	274	Christchurch International Airport	Christchurch	New Zealand
CHF	185	Jinhae Airbase/Airport (G-813/K-10)	Chinhae	South Korea
CHG	186	Chaoyang Airport	Chaoyang	China
CHH	101	Chachapoyas Airport	Chachapoyas	Peru
CHM	101	Teniente FAP Jaime A De Montreuil Morales Airport	Chimbote	Peru
CHN	185	Jeon Ju Airport (G-703)	Jhunju	South Korea
CHO	112	Charlottesville Albemarle Airport	Charlottesville VA	United States
CHQ	217	Chania International Airport	Chania	Greece
CHR	245	Châteauroux-Déols "Marcel Dassault" Airport	Chateauroux	France
CHS	112	Charleston Air Force Base-International Airport	Charleston	United States
CHT	275	Chatham Islands-Tuuta Airport	Chatham Island	New Zealand
CHU	52	Chuathbaluk Airport	Chuathbaluk	United States
CHX	113	Cap Manuel Niño International Airport	Changuinola	Panama
CHY	283	Choiseul Bay Airport	Choiseul Bay	Solomon Islands
CIA	249	Ciampino–G. B. Pastine International Airport	Rome	Italy
CIC	102	Chico Municipal Airport	Chico	United States
CID	77	The Eastern Iowa Airport	Cedar Rapids	United States
CIF	186	Chifeng Airport	Chifeng	China
CIH	186	Changzhi Airport	Changzhi	China
CIJ	100	Capitán Aníbal Arab Airport	Cobija	Bolivia
CIK	52	Chalkyitsik Airport	Chalkyitsik	United States
CIO	63	Teniente Col Carmelo Peralta Airport	Conception	Paraguay
CIP	34	Chipata Airport	Chipata	Zambia
CIS	278	Canton Island Airport	Canton Island	Kiribati
CIT	180	Shymkent Airport	Chimkent	Kazakhstan
CIU	112	Chippewa County International Airport	Sault Ste Marie	United States
CIW	129	Canouan Airport	Canouan Island	Saint Vincent and the Grenadines
CIX	101	Capitan FAP Jose A Quinones Gonzales International Airport	Chiclayo	Peru
CIY	249	Comiso Airport	Comiso	Italy
CIZ	68	Coari Airport	Coari	Brazil
CJA	101	Mayor General FAP Armando Revoredo Iglesias Airport	Cajamarca	Peru
CJB	150	Coimbatore International Airport	Coimbatore	India
CJC	121	El Loa Airport	Calama	Chile
CJJ	185	Cheongju International Airport/Cheongju Air Base (K-59/G-513)	Chongju	South Korea
CJL	165	Chitral Airport	Chitral	Pakistan
CJM	146	Chumphon Airport	Chumphon	Thailand
CJN	161	Nusawiru Airport	Nusawiru	Indonesia
CJS	105	Abraham González International Airport	Ciudad Juarez	Mexico
CJU	185	Jeju International Airport	Cheju	South Korea
CKB	112	North Central West Virginia Airport	Clarksburg	United States
CKC	234	Cherkasy International Airport	Cherkassy	Ukraine
CKG	186	Chongqing Jiangbei International Airport	Chongqing	China
CKH	188	Chokurdakh Airport	Chokurdah	Russia
CKL	243	Chkalovskiy Air Base	Shchyolkovo	Russia
CKS	65	Carajás Airport	Parauapebas	Brazil
CKT	191	Sarakhs Airport	Sarakhs	Iran
CKV	77	Clarksville–Montgomery County Regional Airport	Clarksville	United States
CKY	14	Conakry International Airport	Conakry	Guinea
CKZ	231	Çanakkale Airport	Canakkale	Turkey
CLD	102	Mc Clellan-Palomar Airport	Carlsbad	United States
CLE	112	Cleveland Hopkins International Airport	Cleveland	United States
CLJ	222	Cluj-Napoca International Airport	Cluj-napoca	Romania
CLL	77	Easterwood Field	College Station	United States
CLM	102	William R Fairchild International Airport	Port Angeles	United States
CLN	87	Brig. Lysias Augusto Rodrigues Airport	Carolina	Brazil
CLO	69	Alfonso Bonilla Aragon International Airport	Cali	Colombia
CLQ	107	Licenciado Miguel de la Madrid Airport	Colima	Mexico
CLS	102	Chehalis Centralia Airport	Chehalis	United States
CLT	112	Charlotte Douglas International Airport	Charlotte	United States
CLV	123	Nelson Ribeiro Guimarães Airport	Caldas Novas	Brazil
CLW	112	Clearwater Air Park	Clearwater	United States
CLY	245	Calvi-Sainte-Catherine Airport	Calvi	France
CLZ	73	Calabozo Airport	Calabozo	Venezuela
CMA	209	Cunnamulla Airport	Cunnamulla	Australia
CMB	151	Bandaranaike International Colombo Airport	Colombo	Sri Lanka
CME	107	Ciudad del Carmen International Airport	Ciudad Del Carmen	Mexico
CMF	245	Chambéry-Savoie Airport	Chambery	France
CMG	71	Corumbá International Airport	Corumba	Brazil
CMH	112	John Glenn Columbus International Airport	Columbus	United States
CMI	77	University of Illinois Willard Airport	Champaign	United States
CMJ	189	Chi Mei Airport	Cimei	Taiwan
CMK	9	Club Makokola Airport	Club Makokola	Malawi
CMN	13	Mohammed V International Airport	Casablanca	Morocco
CMP	65	Santana do Araguaia Airport	Santana do Araguaia	Brazil
CMR	245	Colmar-Houssen Airport	Colmar	France
CMU	298	Chimbu Airport	Kundiawa	Papua New Guinea
CMW	96	Ignacio Agramonte International Airport	Camaguey	Cuba
CMX	112	Houghton County Memorial Airport	Hancock	United States
CNB	215	Coonamble Airport	Coonamble	Australia
CNC	209	Coconut Island Airport	Coconut Island	Australia
CND	222	Mihail Kogălniceanu International Airport	Constanta	Romania
CNF	123	Tancredo Neves International Airport	Belo Horizonte	Brazil
CNG	245	Cognac-Châteaubernard (BA 709) Air Base	Cognac	France
CNI	186	Changhai Airport	Changhai	China
CNJ	209	Cloncurry Airport	Cloncurry	Australia
CNL	225	Sindal Airport	Sindal	Denmark
CNM	83	Cavern City Air Terminal	Carlsbad	United States
CNP	124	Neerlerit Inaat Airport	Neerlerit Inaat	Greenland
CNQ	79	Corrientes Airport	Corrientes	Argentina
CNS	209	Cairns International Airport	Cairns	Australia
CNW	77	TSTC Waco Airport	Waco	United States
CNX	146	Chiang Mai International Airport	Chiang Mai	Thailand
CNY	83	Canyonlands Field	Moab	United States
COC	79	Comodoro Pierrestegui Airport	Concordia	Argentina
COD	83	Yellowstone Regional Airport	Cody	United States
COE	102	Coeur D'Alene - Pappy Boyington Field	Coeur d'Alene	United States
COF	112	Patrick Air Force Base	Coco Beach	United States
COG	69	Mandinga Airport	Condoto	Colombia
COH	150	Cooch Behar Airport	Cooch-behar	India
COJ	215	Coonabarabran Airport	Coonabarabran	Australia
COK	150	Cochin International Airport	Kochi	India
CON	112	Concord Municipal Airport	Concord NH	United States
COO	46	Cadjehoun Airport	Cotonou	Benin
COQ	194	Choibalsan Airport	Choibalsan	Mongolia
COR	79	Ingeniero Ambrosio Taravella Airport	Cordoba	Argentina
COS	83	City of Colorado Springs Municipal Airport	Colorado Springs	United States
COT	77	Cotulla-La Salle County Airport	Cotulla	United States
COU	77	Columbia Regional Airport	Columbia	United States
COX	111	Congo Town Airport	Andros	Bahamas
COZ	122	Constanza - Expedición 14 de Junio National Airport	Constanza	Dominican Republic
CPA	40	Cape Palmas Airport	Greenville	Liberia
CPB	69	Capurganá Airport	Capurgana	Colombia
CPC	57	Aviador C. Campos Airport	San Martin Des Andes	Argentina
CPD	208	Coober Pedy Airport	Coober Pedy	Australia
CPE	107	Ingeniero Alberto Acuña Ongay International Airport	Campeche	Mexico
CPH	225	Copenhagen Kastrup Airport	Copenhagen	Denmark
CPQ	123	Amarais Airport	Campinas	Brazil
CPR	83	Casper-Natrona County International Airport	Casper	United States
CPT	23	Cape Town International Airport	Cape Town	South Africa
CPV	87	Presidente João Suassuna Airport	Campina Grande	Brazil
CPX	118	Benjamin Rivera Noriega Airport	Culebra Island	Puerto Rico
CQD	191	Shahrekord Airport	Shahre Kord	Iran
CQF	245	Calais-Dunkerque Airport	Calais	France
CQM	239	Ciudad Real Central Airport	Ciudad Real	Spain
CRA	222	Craiova Airport	Craiova	Romania
CRC	69	Santa Ana Airport	Cartago	Colombia
CRD	74	General E. Mosconi Airport	Comodoro Rivadavia	Argentina
CRE	112	Grand Strand Airport	North Myrtle Beach	United States
CRI	111	Colonel Hill Airport	Colonel Hill	Bahamas
CRK	172	Diosdado Macapagal International Airport	Angeles City	Philippines
CRL	221	Brussels South Charleroi Airport	Charleroi	Belgium
CRM	172	Catarman National Airport	Catarman	Philippines
CRP	77	Corpus Christi International Airport	Corpus Christi	United States
CRQ	87	Caravelas Airport	Caravelas	Brazil
CRV	249	Crotone Airport	Crotone	Italy
CRW	112	Yeager Airport	Charleston	United States
CRZ	142	Turkmenabat Airport	Chardzhou	Turkmenistan
CSA	237	Colonsay Airstrip	Colonsay	United Kingdom
CSB	222	Caransebeş Airport	Caransebes	Romania
CSF	245	Creil Air Base	Creil	France
CSG	112	Columbus Metropolitan Airport	Columbus	United States
CSH	243	Solovki Airport	Solovetsky Islands	Russia
CSK	15	Cap Skirring Airport	Cap Skiring	Senegal
CSM	77	Clinton Sherman Airport	Clinton	United States
CSO	219	Cochstedt Airport	Cochstedt	Germany
CSX	186	Changsha Huanghua International Airport	Changcha	China
CSY	243	Cheboksary Airport	Cheboksary	Russia
CSZ	70	Brigadier D.H.E. Ruiz Airport	Colonel Suarez	Argentina
CTA	249	Catania-Fontanarossa Airport	Catania	Italy
CTB	83	Cut Bank International Airport	Cutbank	United States
CTC	74	Catamarca Airport	Catamarca	Argentina
CTD	113	Alonso Valderrama Airport	Chitré	Panama
CTG	69	Rafael Nuñez International Airport	Cartagena	Colombia
CTH	112	Chester County G O Carlson Airport	Coatesville	United States
CTL	209	Charleville Airport	Charlieville	Australia
CTM	72	Chetumal International Airport	Chetumal	Mexico
CTN	209	Cooktown Airport	Cooktown	Australia
CTS	193	New Chitose Airport	Sapporo	Japan
CTT	245	Le Castellet Airport	Le Castellet	France
CTU	186	Chengdu Shuangliu International Airport	Chengdu	China
CTY	112	Cross City Airport	Cross City	United States
CUA	105	Ciudad Constitución Airport	Ciudad Constitución	Mexico
CUC	69	Camilo Daza International Airport	Cucuta	Colombia
CUE	93	Mariscal Lamar Airport	Cuenca	Ecuador
CUF	249	Cuneo International Airport	Cuneo	Italy
CUH	77	Cushing Municipal Airport	Cushing	United States
CUL	105	Bachigualato Federal International Airport	Culiacan	Mexico
CUM	73	Cumaná (Antonio José de Sucre) Airport	Cumana	Venezuela
CUN	72	Cancún International Airport	Cancun	Mexico
CUP	73	General Francisco Bermúdez Airport	Carupano	Venezuela
CUQ	209	Coen Airport	Coen	Australia
CUR	81	Hato International Airport	Willemstad	Netherlands Antilles
CUT	57	Cutral-Co Airport	Cutralco	Argentina
CUU	105	General Roberto Fierro Villalobos International Airport	Chihuahua	Mexico
CUZ	101	Alejandro Velasco Astete International Airport	Cuzco	Peru
CVF	245	Courchevel Airport	Courcheval	France
CVG	112	Cincinnati Northern Kentucky International Airport	Cincinnati	United States
CVJ	107	General Mariano Matamoros Airport	Cuernavaca	Mexico
CVM	107	General Pedro Jose Mendez International Airport	Ciudad Victoria	Mexico
CVN	83	Clovis Municipal Airport	Clovis	United States
CVO	102	Corvallis Municipal Airport	Corvallis	United States
CVQ	214	Carnarvon Airport	Carnarvon	Australia
CVS	83	Cannon Air Force Base	Clovis	United States
CVT	237	Coventry Airport	Coventry	United Kingdom
CVU	200	Corvo Airport	Corvo	Portugal
CWA	77	Central Wisconsin Airport	Wassau	United States
CWB	123	Afonso Pena Airport	Curitiba	Brazil
CWC	234	Chernivtsi International Airport	Chernovtsk	Ukraine
CWE	12	Cairo West Airport	Cairo	Egypt
CWI	77	Clinton Municipal Airport	Clinton	United States
CWL	237	Cardiff International Airport	Cardiff	United Kingdom
CWT	215	Cowra Airport	Chatsworth	Australia
CXA	73	Caicara del Orinoco Airport	Caicara De Orinoco	Venezuela
CXB	153	Cox's Bazar Airport	Cox's Bazar	Bangladesh
CXH	135	Vancouver Harbour Water Aerodrome	Vancouver	Canada
CXJ	123	Hugo Cantergiani Regional Airport	Caxias Do Sul	Brazil
CXL	102	Calexico International Airport	Calexico	United States
CXO	77	Conroe-North Houston Regional Airport	Conroe	United States
CXP	161	Tunggul Wulung Airport	Cilacap	Indonesia
CXR	183	Cam Ranh Airport	Nha Trang	Vietnam
CYA	116	Les Cayes Airport	Cayes	Haiti
CYB	76	Gerrard Smith International Airport	Cayman Brac	Cayman Islands
CYF	52	Chefornak Airport	Chefornak	United States
CYI	189	Chiayi Airport	Chiayi	Taiwan
CYO	96	Vilo Acuña International Airport	Cayo Largo del Sur	Cuba
CYP	172	Calbayog Airport	Calbayog City	Philippines
CYR	109	Laguna de Los Patos International Airport	Colonia	Uruguay
CYS	83	Cheyenne Regional Jerry Olson Field	Cheyenne	United States
CYT	52	Yakataga Airport	Yakataga	United States
CYU	172	Cuyo Airport	Cuyo	Philippines
CYW	107	Captain Rogelio Castillo National Airport	Celaya	Mexico
CYX	188	Cherskiy Airport	Cherskiy	Russia
CYZ	172	Cauayan Airport	Cauayan	Philippines
CZA	107	Chichen Itza International Airport	Chichen Itza	Mexico
CZE	73	José Leonardo Chirinos Airport	Coro	Venezuela
CZF	52	Cape Romanzof LRRS Airport	Cape Romanzof	United States
CZL	3	Mohamed Boudiaf International Airport	Constantine	Algeria
CZM	72	Cozumel International Airport	Cozumel	Mexico
CZS	120	Cruzeiro do Sul Airport	Cruzeiro do Sul	Brazil
CZU	69	Las Brujas Airport	Corozal	Colombia
CZX	186	Changzhou Benniu Airport	Changzhou	China
DAB	112	Daytona Beach International Airport	Daytona Beach	United States
DAC	153	Hazrat Shahjalal International Airport	Dhaka	Bangladesh
DAD	183	Da Nang International Airport	Danang	Vietnam
DAL	77	Dallas Love Field	Dallas	United States
DAM	152	Damascus International Airport	Damascus	Syria
DAN	112	Danville Regional Airport	Danville	United States
DAR	16	Julius Nyerere International Airport	Dar Es Salaam	Tanzania
DAT	186	Datong Airport	Datong	China
DAU	298	Daru Airport	Daru	Papua New Guinea
DAV	113	Enrique Malek International Airport	David	Panama
DAX	186	Dachuan Airport	Dazhou	China
DAY	112	James M Cox Dayton International Airport	Dayton	United States
DBA	165	Dalbandin Airport	Dalbandin	Pakistan
DBB	12	El Alamein International Airport	Dabaa City	Egypt
DBD	150	Dhanbad Airport	Dhanbad	India
DBM	2	Debra Marcos Airport	Debre Marqos	Ethiopia
DBN	112	W H 'Bud' Barron Airport	Dublin	United States
DBO	215	Dubbo City Regional Airport	Dubbo	Australia
DBQ	77	Dubuque Regional Airport	Dubuque IA	United States
DBT	2	Debre Tabor Airport	Debre Tabor	Ethiopia
DBV	261	Dubrovnik Airport	Dubrovnik	Croatia
DCA	112	Ronald Reagan Washington National Airport	Washington	United States
DCF	84	Canefield Airport	Canefield	Dominica
DCI	249	Decimomannu Air Base	Decimomannu	Italy
DCM	245	Castres-Mazamet Airport	Castres	France
DCT	111	Duncan Town Airport	Duncan Town	Bahamas
DCY	186	Daocheng Yading Airport	Daocheng	China
DDC	77	Dodge City Regional Airport	Dodge City	United States
DDG	186	Dandong Airport	Dandong	China
DEA	165	Dera Ghazi Khan Airport	Dera Ghazi Khan	Pakistan
DEB	223	Debrecen International Airport	Debrecen	Hungary
DEC	77	Decatur Airport	Decatur	United States
DED	150	Dehradun Airport	Dehra Dun	India
DEF	191	Dezful Airport	Dezful	Iran
DEL	150	Indira Gandhi International Airport	Delhi	India
DEM	2	Dembidollo Airport	Dembidollo	Ethiopia
DEN	83	Denver International Airport	Denver	United States
DES	268	Desroches Airport	Desroches	Seychelles
DET	112	Coleman A. Young Municipal Airport	Detroit	United States
DEZ	152	Deir ez-Zor Air Base	Deire Zor	Syria
DFW	77	Dallas Fort Worth International Airport	Dallas-Fort Worth	United States
DGE	215	Mudgee Airport	Mudgee	Australia
DGL	115	Douglas Municipal Airport	Douglas	United States
DGO	107	General Guadalupe Victoria International Airport	Durango	Mexico
DGT	172	Sibulan Airport	Dumaguete	Philippines
DHA	182	King Abdulaziz Air Base	Dhahran	Saudi Arabia
DHF	155	Al Dhafra Air Base	Abu Dhabi	United Arab Emirates
DHI	166	Dhangarhi Airport	Dhangarhi	Nepal
DHM	150	Kangra Airport	Kangra	India
DHN	77	Dothan Regional Airport	Dothan	United States
DHR	216	De Kooy Airport	De Kooy	Netherlands
DHT	77	Dalhart Municipal Airport	Dalhart	United States
DIA	179	Doha International Airport	Doha	Qatar
DIB	150	Dibrugarh Airport	Mohanbari	India
DIE	263	Arrachart Airport	Antsiranana	Madagascar
DIG	186	Diqing Airport	Shangri-La	China
DIJ	245	Dijon-Bourgogne Airport	Dijon	France
DIK	83	Dickinson Theodore Roosevelt Regional Airport	Dickinson	United States
DIL	154	Presidente Nicolau Lobato International Airport	Dili	East Timor
DIN	183	Dien Bien Phu Airport	Dienbienphu	Vietnam
DIR	2	Aba Tenna Dejazmach Yilma International Airport	Dire Dawa	Ethiopia
DIS	10	Ngot Nzoungou Airport	Loubomo	Congo (Brazzaville)
DIU	150	Diu Airport	Diu	India
DIY	231	Diyarbakir Airport	Diyabakir	Turkey
DJB	161	Sultan Thaha Airport	Jambi	Indonesia
DJE	49	Djerba Zarzis International Airport	Djerba	Tunisia
DJG	3	Djanet Inedbirene Airport	Djanet	Algeria
DJJ	162	Sentani International Airport	Jayapura	Indonesia
DJO	0	Daloa Airport	Daloa	Cote d'Ivoire
DKI	209	Dunk Island Airport	Dunk Island	Australia
DKK	112	Chautauqua County-Dunkirk Airport	Dunkirk	United States
DKR	15	Léopold Sédar Senghor International Airport	Dakar	Senegal
DKS	167	Dikson Airport	Dikson	Russia
DLA	18	Douala International Airport	Douala	Cameroon
DLC	186	Zhoushuizi Airport	Dalian	China
DLD	244	Geilo Airport Dagali	Geilo	Norway
DLE	245	Dole-Tavaux Airport	Dole	France
DLF	77	DLF Airport	Del Rio	United States
DLG	52	Dillingham Airport	Dillingham	United States
DLH	77	Duluth International Airport	Duluth	United States
DLI	183	Lien Khuong Airport	Dalat	Vietnam
DLM	231	Dalaman International Airport	Dalaman	Turkey
DLS	102	Columbia Gorge Regional the Dalles Municipal Airport	The Dalles	United States
DLU	186	Dali Airport	Dali	China
DLY	277	Dillon's Bay Airport	Dillon's Bay	Vanuatu
DLZ	194	Dalanzadgad Airport	Dalanzadgad	Mongolia
DMA	115	Davis Monthan Air Force Base	Tucson	United States
DMB	180	Taraz Airport	Dzhambul	Kazakhstan
DMD	209	Doomadgee Airport	Doomadgee	Australia
DME	243	Domodedovo International Airport	Moscow	Russia
DMK	146	Don Mueang International Airport	Bangkok	Thailand
DMM	182	King Fahd International Airport	Dammam	Saudi Arabia
DMT	71	Diamantino Airport	Diamantino	Brazil
DMU	150	Dimapur Airport	Dimapur	India
DNA	193	Kadena Air Base	Kadena	Japan
DND	237	Dundee Airport	Dundee	United Kingdom
DNH	186	Dunhuang Airport	Dunhuang	China
DNK	234	Dnipropetrovsk International Airport	Dnepropetrovsk	Ukraine
DNL	112	Daniel Field	Augusta	United States
DNN	112	Dalton Municipal Airport	Dalton	United States
DNP	166	Tulsipur Airport	Dang	Nepal
DNR	245	Dinard-Pleurtuit-Saint-Malo Airport	Dinard	France
DNV	77	Vermilion Regional Airport	Danville	United States
DNZ	231	Çardak Airport	Denizli	Turkey
DOD	16	Dodoma Airport	Dodoma	Tanzania
DOG	26	Dongola Airport	Dongola	Sudan
DOK	234	Donetsk International Airport	Donetsk	Ukraine
DOL	245	Deauville-Saint-Gatien Airport	Deauville	France
DOM	84	Douglas-Charles Airport	Dominica	Dominica
DOP	166	Dolpa Airport	Dolpa	Nepal
DOU	71	Dourados Airport	Dourados	Brazil
DOV	112	Dover Air Force Base	Dover	United States
DOY	186	Dongying Shengli Airport	Dongying	China
DPA	77	Dupage Airport	West Chicago	United States
DPL	172	Dipolog Airport	Dipolog	Philippines
DPO	213	Devonport Airport	Devonport	Australia
DPS	171	Ngurah Rai (Bali) International Airport	Denpasar	Indonesia
DQA	186	Saertu Airport	Daqing	China
DRB	214	Derby Airport	Derby	Australia
DRE	112	Drummond Island Airport	Drummond Island	United States
DRG	52	Deering Airport	Deering	United States
DRI	77	Beauregard Regional Airport	Deridder	United States
DRJ	114	Drietabbetje Airport	Drietabbetje	Suriname
DRK	80	Drake Bay Airport	Puntarenas	Costa Rica
DRO	83	Durango La Plata County Airport	Durango	United States
DRS	219	Dresden Airport	Dresden	Germany
DRT	77	Del Rio International Airport	Del Rio	United States
DRW	210	Darwin International Airport	Darwin	Australia
DSA	237	Robin Hood Doncaster Sheffield Airport	Doncaster, Sheffield	United Kingdom
DSD	91	La Désirade Airport	Grande Anse	Guadeloupe
DSE	2	Combolcha Airport	Dessie	Ethiopia
DSI	77	Destin Executive Airport	Destin	United States
DSK	165	Dera Ismael Khan Airport	Dera Ismael Khan	Pakistan
DSM	77	Des Moines International Airport	Des Moines	United States
DSN	186	Ordos Ejin Horo Airport	Dongsheng	China
DSO	178	Sondok Airport	Hamhung	North Korea
DTA	83	Delta Municipal Airport	Delta	United States
DTB	161	Silangit Airport	Siborong-Borong	Indonesia
DTD	171	Datadawai Airport	Datadawai-Borneo Island	Indonesia
DTE	172	Daet Airport	Daet	Philippines
DTI	123	Diamantina Airport	Diamantina	Brazil
DTM	219	Dortmund Airport	Dortmund	Germany
DTN	77	Shreveport Downtown Airport	Shreveport	United States
DTW	112	Detroit Metropolitan Wayne County Airport	Detroit	United States
DUB	226	Dublin Airport	Dublin	Ireland
DUC	77	Halliburton Field	Duncan	United States
DUD	274	Dunedin Airport	Dunedin	New Zealand
DUE	32	Dundo Airport	Dundo	Angola
DUG	115	Bisbee Douglas International Airport	Douglas	United States
DUJ	112	DuBois Regional Airport	Du Bois	United States
DUM	161	Pinang Kampai Airport	Dumai	Indonesia
DUR	23	King Shaka International Airport	Durban	South Africa
DUS	219	Düsseldorf Airport	Duesseldorf	Germany
DUT	52	Unalaska Airport	Unalaska	United States
DVL	77	Devils Lake Regional Airport	Devils Lake	United States
DVO	172	Francisco Bangoy International Airport	Davao	Philippines
DVT	115	Phoenix Deer Valley Airport	Phoenix 	United States
DWB	263	Soalala Airport	Soalala	Madagascar
DWC	155	Al Maktoum International Airport	Dubai	United Arab Emirates
DWH	77	David Wayne Hooks Memorial Airport	Houston	United States
DXB	155	Dubai International Airport	Dubai	United Arab Emirates
DXR	112	Danbury Municipal Airport	Danbury	United States
DYG	186	Dayong Airport	Dayong	China
DYL	112	Doylestown Airport	Doylestown	United States
DYR	141	Ugolny Airport	Anadyr	Russia
DYS	77	Dyess Air Force Base	Abilene	United States
DYU	156	Dushanbe Airport	Dushanbe	Tajikistan
DZA	271	Dzaoudzi Pamandzi International Airport	Dzaoudzi	Mayotte
DZN	180	Zhezkazgan Airport	Zhezkazgan	Kazakhstan
DZO	109	Santa Bernardina International Airport	Durazno	Uruguay
EAA	52	Eagle Airport	Eagle	United States
EAE	277	Siwo Airport	Sangafa	Vanuatu
EAM	182	Nejran Airport	Nejran	Saudi Arabia
EAS	239	San Sebastian Airport	San Sebastian	Spain
EAT	102	Pangborn Memorial Airport	Wenatchee	United States
EAU	77	Chippewa Valley Regional Airport	Eau Claire	United States
EBA	249	Marina Di Campo Airport	Marina Di Campo	Italy
EBB	25	Entebbe International Airport	Entebbe	Uganda
EBD	26	El Obeid Airport	El Obeid	Sudan
EBG	69	El Bagre Airport	El Bagre	Colombia
EBJ	225	Esbjerg Airport	Esbjerg	Denmark
EBL	143	Erbil International Airport	Erbil	Iraq
EBM	49	El Borma Airport	El Borma	Tunisia
EBU	245	Saint-Étienne-Bouthéon Airport	St-Etienne	France
ECA	112	Iosco County Airport	East Tawas	United States
ECG	112	Elizabeth City Regional Airport & Coast Guard Air Station	Elizabeth City	United States
ECN	174	Ercan International Airport	Nicosia	Cyprus
ECP	77	Northwest Florida Beaches International Airport	Panama City	United States
EDF	52	Elmendorf Air Force Base	Anchorage	United States
EDI	237	Edinburgh Airport	Edinburgh	United Kingdom
EDL	41	Eldoret International Airport	Eldoret	Kenya
EDM	245	La Roche-sur-Yon Airport	La Roche-sur-yon	France
EDO	231	Balıkesir Körfez Airport	Balikesir Korfez	Turkey
EDR	209	Pormpuraaw Airport	Pormpuraaw	Australia
EDW	102	Edwards Air Force Base	Edwards Afb	United States
EEK	52	Eek Airport	Eek	United States
EEN	112	Dillant Hopkins Airport	Keene	United States
EFD	77	Ellington Airport	Houston	United States
EFL	217	Kefallinia Airport	Keffallinia	Greece
EGC	245	Bergerac-Roumanière Airport	Bergerac	France
EGE	83	Eagle County Regional Airport	Vail	United States
EGH	12	El Gora Airport	El Gorah	Egypt
EGM	283	Sege Airport	Sege	Solomon Islands
EGN	26	Geneina Airport	Geneina	Sudan
EGO	243	Belgorod International Airport	Belgorod	Russia
EGS	205	Egilsstaðir Airport	Egilsstadir	Iceland
EGV	77	Eagle River Union Airport	Eagle River	United States
EGX	52	Egegik Airport	Egegik	United States
EHL	57	El Bolson Airport	El Bolson	Argentina
EHM	52	Cape Newenham LRRS Airport	Cape Newenham	United States
EIB	219	Eisenach-Kindel Airport	Eisenach	Germany
EIE	167	Yeniseysk Airport	Yeniseysk	Russia
EIK	243	Yeysk Airport	Eysk	Russia
EIL	52	Eielson Air Force Base	Fairbanks	United States
EIN	216	Eindhoven Airport	Eindhoven	Netherlands
EIS	134	Terrance B. Lettsome International Airport	Tortola	British Virgin Islands
EIY	163	Ein Yahav Airfield	Eyn-yahav	Israel
EJA	69	Yariguíes Airport	Barrancabermeja	Colombia
EJH	182	Al Wajh Domestic Airport	Wejh	Saudi Arabia
EKB	180	Ekibastuz Airport	Ekibastuz	Kazakhstan
EKN	112	Elkins-Randolph Co-Jennings Randolph Field	Elkins	United States
EKO	102	Elko Regional Airport	Elko	United States
EKT	255	Eskilstuna Airport	Eskilstuna	Sweden
ELB	69	Las Flores Airport	El Banco	Colombia
ELC	210	Elcho Island Airport	Elcho Island	Australia
ELD	77	South Arkansas Regional At Goodwin Field	El Dorado	United States
ELF	26	El Fasher Airport	El Fasher	Sudan
ELG	3	El Golea Airport	El Golea	Algeria
ELH	111	North Eleuthera Airport	North Eleuthera	Bahamas
ELI	52	Elim Airport	Elim	United States
ELM	112	Elmira Corning Regional Airport	Elmira	United States
ELO	79	El Dorado Airport	El Dorado	Argentina
ELP	83	El Paso International Airport	El Paso	United States
ELQ	182	Gassim Airport	Gassim	Saudi Arabia
ELS	23	Ben Schoeman Airport	East London	South Africa
ELT	12	El Tor Airport	El-tor	Egypt
ELU	3	Guemar Airport	Guemar	Algeria
ELV	52	Elfin Cove Seaplane Base	Elfin Cove	United States
ELY	102	Ely Airport Yelland Field	Ely	United States
EMA	237	East Midlands Airport	East Midlands	United Kingdom
EMD	209	Emerald Airport	Emerald	Australia
EME	219	Emden Airport	Emden	Germany
EMK	52	Emmonak Airport	Emmonak	United States
EML	262	Emmen Air Base	Emmen	Switzerland
EMN	44	Néma Airport	Nema	Mauritania
EMP	77	Emporia Municipal Airport	Kempten	Germany
ENA	52	Kenai Municipal Airport	Kenai	United States
ENC	245	Nancy-Essey Airport	Nancy	France
END	77	Vance Air Force Base	Enid	United States
ENE	171	Ende (H Hasan Aroeboesman) Airport	Ende	Indonesia
ENF	229	Enontekio Airport	Enontekio	Finland
ENH	186	Enshi Airport	Enshi	China
ENK	237	St Angelo Airport	Enniskillen	United Kingdom
ENS	216	Twente Airport	Enschede	Netherlands
ENT	288	Eniwetok Airport	Eniwetok Atoll	Marshall Islands
ENU	29	Akanu Ibiam International Airport	Enugu	Nigeria
ENV	83	Wendover Airport	Wendover	United States
ENW	77	Kenosha Regional Airport	Kenosha	United States
ENY	186	Yan'an Ershilipu Airport	Yan'an	China
EOH	69	Enrique Olaya Herrera Airport	Medellin	Colombia
EOI	237	Eday Airport	Eday	United Kingdom
EOK	77	Keokuk Municipal Airport	Keokuk	United States
EOR	73	El Dorado Airport	El Dorado	Venezuela
EOZ	73	Elorza Airport	Elorza	Venezuela
EPA	70	El Palomar Airport	El Palomar	Argentina
EPL	245	Épinal-Mirecourt Airport	Epinal	France
EPR	214	Esperance Airport	Esperance	Australia
EPU	256	Pärnu Airport	Parnu	Estonia
EQS	74	Brigadier Antonio Parodi Airport	Esquel	Argentina
ERC	231	Erzincan Airport	Erzincan	Turkey
ERF	219	Erfurt Airport	Erfurt	Germany
ERG	160	Yerbogachen Airport	Yerbogachen	Russia
ERH	13	Moulay Ali Cherif Airport	Er-rachidia	Morocco
ERI	112	Erie International Tom Ridge Field	Erie	United States
ERM	123	Erechim Airport	Erechim	Brazil
ERN	68	Eirunepé Airport	Eirunepe	Brazil
ERS	50	Eros Airport	Windhoek	Namibia
ERV	77	Kerrville Municipal Louis Schreiner Field	Kerrville	United States
ERZ	231	Erzurum International Airport	Erzurum	Turkey
ESB	231	Esenboğa International Airport	Ankara	Turkey
ESC	112	Delta County Airport	Escanaba	United States
ESD	102	Orcas Island Airport	Eastsound	United States
ESE	132	Ensenada International Airport	Ensenada	Mexico
ESF	77	Esler Regional Airport	Alexandria	United States
ESG	63	Dr. Luis Maria Argaña International Airport	Mariscal Estigarribia	Paraguay
ESH	237	Shoreham Airport	Shoreham By Sea	United Kingdom
ESK	231	Eskişehir Air Base	Eskisehir	Turkey
ESL	243	Elista Airport	Elista	Russia
ESM	93	General Rivadeneira Airport	Esmeraldas	Ecuador
ESN	112	Easton Newnam Field	Easton	United States
ESR	121	Ricardo García Posada Airport	El Salvador	Chile
ESS	219	Essen Mulheim Airport	Essen	Germany
ESU	13	Mogador Airport	Essadouira	Morocco
ETH	163	Eilat Airport	Elat	Israel
ETR	93	Santa Rosa International Airport	Santa Rosa	Ecuador
ETZ	245	Metz-Nancy-Lorraine Airport	Metz	France
EUA	303	Kaufana Airport	Eua Island	Tonga
EUF	77	Weedon Field	Eufala	United States
EUG	102	Mahlon Sweet Field	Eugene	United States
EUM	219	Neumünster Airport	Neumuenster	Germany
EUN	19	Hassan I Airport	El Aaiún	Western Sahara
EUQ	172	Evelio Javier Airport	San Jose	Philippines
EUX	81	F. D. Roosevelt Airport	Oranjestad	Netherlands Antilles
EVE	244	Harstad/Narvik Airport, Evenes	Harstad/Narvik	Norway
EVG	255	Sveg Airport	Sveg	Sweden
EVN	199	Zvartnots International Airport	Yerevan	Armenia
EVV	77	Evansville Regional Airport	Evansville	United States
EVW	83	Evanston-Uinta County Airport-Burns Field	Evanston	United States
EVX	245	Évreux-Fauville (BA 105) Air Base	Evreux	France
EWB	112	New Bedford Regional Airport	New Bedford	United States
EWK	77	Newton City-County Airport	Newton	United States
EWN	112	Coastal Carolina Regional Airport	New Bern	United States
EWR	112	Newark Liberty International Airport	Newark	United States
EXT	237	Exeter International Airport	Exeter	United Kingdom
EYK	198	Beloyarskiy Airport	Beloyarsky	Russia
EYP	69	El Yopal Airport	Yopal	Colombia
EYW	112	Key West International Airport	Key West	United States
EZE	70	Ministro Pistarini International Airport	Buenos Aires	Argentina
EZS	231	Elazığ Airport	Elazig	Turkey
EZV	198	Berezovo Airport	Berezovo	Russia
FAA	14	Faranah Airport	Faranah	Guinea
FAB	237	Farnborough Airport	Farnborough	United Kingdom
FAE	204	Vagar Airport	Vagar	Faroe Islands
FAF	112	Felker Army Air Field	Fort Eustis	United States
FAI	52	Fairbanks International Airport	Fairbanks	United States
FAJ	118	Diego Jimenez Torres Airport	Fajardo	Puerto Rico
FAN	244	Lista Airport	Farsund	Norway
FAO	235	Faro Airport	Faro	Portugal
FAR	77	Hector International Airport	Fargo	United States
FAT	102	Fresno Yosemite International Airport	Fresno	United States
FAV	301	Fakarava Airport	Fakarava	French Polynesia
FAY	112	Fayetteville Regional Grannis Field	Fayetteville	United States
FAZ	191	Fasa Airport	Fasa	Iran
FBA	68	Fonte Boa Airport	Fonte Boa	Brazil
FBD	164	Fayzabad Airport	Faizabad	Afghanistan
FBE	123	Francisco Beltrão Airport	Francisco Beltrao	Brazil
FBG	112	Simmons Army Air Field	Fredericksburg	United States
FBK	52	Ladd AAF Airfield	Fort Wainwright	United States
FBM	33	Lubumbashi International Airport	Lubumashi	Congo (Kinshasa)
FBR	83	Fort Bridger Airport	Fort Bridger	United States
FBU	244	Oslo, Fornebu Airport	Oslo	Norway
FCA	83	Glacier Park International Airport	Kalispell	United States
FCB	23	Ficksburg Sentraoes Airport	Ficksburg	South Africa
FCM	77	Flying Cloud Airport	Eden Prairie	United States
FCN	219	Nordholz Naval Airbase	Nordholz	Germany
FCO	249	Leonardo da Vinci–Fiumicino Airport	Rome	Italy
FCS	83	Butts AAF (Fort Carson) Air Field	Fort Carson	United States
FDF	104	Martinique Aimé Césaire International Airport	Fort-de-france	Martinique
FDH	219	Friedrichshafen Airport	Friedrichshafen	Germany
FDO	70	San Fernando Airport	San Fernando	Argentina
FDU	28	Bandundu Airport	Bandoundu	Congo (Kinshasa)
FDY	112	Findlay Airport	Findley	United States
FEG	184	Fergana International Airport	Fergana	Uzbekistan
FEL	219	Fürstenfeldbruck Air Base	Fuerstenfeldbruck	Germany
FEN	87	Fernando de Noronha Airport	Fernando Do Noronha	Brazil
FEZ	13	Saïss Airport	Fes	Morocco
FFA	112	First Flight Airport	Kill Devil Hills	United States
FFD	237	RAF Fairford	Fairford	United Kingdom
FFO	112	Wright-Patterson Air Force Base	Dayton	United States
FFT	112	Capital City Airport	Frankfort	United States
FFU	121	Futaleufú Airport	Futaleufu	Chile
FGI	273	Fagali'i Airport	Apia	Samoa
FGU	301	Fangatau Airport	Fangatau	French Polynesia
FHU	115	Sierra Vista Municipal Libby Army Air Field	Fort Huachuca	United States
FIE	237	Fair Isle Airport	Fair Isle	United Kingdom
FIG	14	Fria Airport	Fira	Guinea
FIH	28	Ndjili International Airport	Kinshasa	Congo (Kinshasa)
FIZ	214	Fitzroy Crossing Airport	Fitzroy Crossing	Australia
FJR	155	Fujairah International Airport	Fujeirah	United Arab Emirates
FKB	219	Karlsruhe Baden-Baden Airport	Karlsruhe/Baden-Baden	Germany
FKI	33	Bangoka International Airport	Kisangani	Congo (Kinshasa)
FKJ	193	Fukui Airport	Fukui	Japan
FKL	112	Venango Regional Airport	Franklin	United States
FKQ	162	Fakfak Airport	Fak Fak	Indonesia
FKS	193	Fukushima Airport	Fukushima	Japan
FLA	69	Gustavo Artunduaga Paredes Airport	Florencia	Colombia
FLD	77	Fond du Lac County Airport	Fond du Lac	United States
FLF	219	Flensburg-Schäferhaus Airport	Flensburg	Germany
FLG	115	Flagstaff Pulliam Airport	Flagstaff	United States
FLL	112	Fort Lauderdale Hollywood International Airport	Fort Lauderdale	United States
FLN	123	Hercílio Luz International Airport	Florianopolis	Brazil
FLO	112	Florence Regional Airport	Florence	United States
FLR	249	Peretola Airport	Florence	Italy
FLS	213	Flinders Island Airport	Flinders Island	Australia
FLV	77	Sherman Army Air Field	Fort Leavenworth	United States
FLW	200	Flores Airport	Flores	Portugal
FLZ	161	Dr Ferdinand Lumban Tobing Airport	Sibolga	Indonesia
FMA	79	Formosa Airport	Formosa	Argentina
FME	112	Tipton Airport	Fort Meade	United States
FMH	112	Cape Cod Coast Guard Air Station	Falmouth	United States
FMI	33	Kalemie Airport	Kalemie	Congo (Kinshasa)
FMM	219	Memmingen Allgau Airport	Memmingen	Germany
FMN	83	Four Corners Regional Airport	Farmington	United States
FMO	219	Münster Osnabrück Airport	Munster	Germany
FMY	112	Page Field	Fort Myers	United States
FNA	20	Lungi International Airport	Freetown	Sierra Leone
FNC	235	Madeira Airport	Funchal	Portugal
FNI	245	Nîmes-Arles-Camargue Airport	Nimes	France
FNJ	178	Pyongyang Sunan International Airport	Pyongyang	North Korea
FNL	83	Northern Colorado Regional Airport	Fort Collins	United States
FNR	52	Funter Bay Seaplane Base	Funter Bay	United States
FNT	112	Bishop International Airport	Flint	United States
FNU	249	Oristano-Fenosu Airport	Oristano	Italy
FOC	186	Fuzhou Changle International Airport	Fuzhou	China
FOD	77	Fort Dodge Regional Airport	Fort Dodge	United States
FOE	77	Topeka Regional Airport - Forbes Field	Topeka	United States
FOG	249	Foggia "Gino Lisa" Airport	Foggia	Italy
FOK	112	Francis S Gabreski Airport	West Hampton Beach	United States
FOM	18	Foumban Nkounja Airport	Foumban	Cameroon
FON	80	Arenal Airport	La Fortuna/San Carlos	Costa Rica
FOR	87	Pinto Martins International Airport	Fortaleza	Brazil
FOS	214	Forrest Airport	Forrest	Australia
FPO	111	Grand Bahama International Airport	Freeport	Bahamas
FPR	112	St Lucie County International Airport	Fort Pierce	United States
FRA	219	Frankfurt am Main Airport	Frankfurt	Germany
FRC	123	Tenente Lund Pressoto Airport	Franca	Brazil
FRD	102	Friday Harbor Airport	Friday Harbor	United States
FRE	283	Fera/Maringe Airport	Fera Island	Solomon Islands
FRG	112	Republic Airport	Farmingdale	United States
FRI	77	Marshall Army Air Field	Fort Riley	United States
FRJ	245	Fréjus Airport	Frejus	France
FRL	249	Forlì Airport	Forli	Italy
FRN	52	Bryant Army Heliport	Fort Richardson	United States
FRO	244	Florø Airport	Floro	Norway
FRS	92	Mundo Maya International Airport	Flores	Guatemala
FRU	148	Manas International Airport	Bishkek	Kyrgyzstan
FRW	21	Francistown Airport	Francistown	Botswana
FRY	112	Eastern Slopes Regional Airport	Fryeburg	United States
FRZ	219	Fritzlar Airport	Fritzlar	Germany
FSC	245	Figari Sud-Corse Airport	Figari	France
FSD	77	Joe Foss Field Airport	Sioux Falls	United States
FSI	77	Henry Post Army Air Field (Fort Sill)	Fort Sill	United States
FSM	77	Fort Smith Regional Airport	Fort Smith	United States
FSP	108	St Pierre Airport	St.-pierre	Saint Pierre and Miquelon
FST	77	Fort Stockton Pecos County Airport	Fort Stockton	United States
FTA	277	Futuna Airport	Futuna Island	Vanuatu
FTE	56	El Calafate Airport	El Calafate	Argentina
FTI	295	Fitiuta Airport	Fiti'uta	American Samoa
FTK	112	Godman Army Air Field	Fort Knox	United States
FTU	263	Tôlanaro Airport	Tolagnaro	Madagascar
FTW	77	Fort Worth Meacham International Airport	Fort Worth	United States
FTX	10	Owando Airport	Owando	Congo (Kinshasa)
FTY	112	Fulton County Airport Brown Field	Atlanta	United States
FUE	202	Fuerteventura Airport	Fuerteventura	Spain
FUG	186	Fuyang Xiguan Airport	Fuyang	China
FUJ	193	Fukue Airport	Fukue	Japan
FUK	193	Fukuoka Airport	Fukuoka	Japan
FUL	102	Fullerton Municipal Airport	Fullerton	United States
FUN	280	Funafuti International Airport	Funafuti	Tuvalu
FUO	186	Foshan Shadi Airport	Foshan	China
FUT	305	Pointe Vele Airport	Futuna Island	Wallis and Futuna
FWA	112	Fort Wayne International Airport	Fort Wayne	United States
FWH	77	NAS Fort Worth JRB/Carswell Field	Dallas	United States
FXE	112	Fort Lauderdale Executive Airport	Fort Lauderdale	United States
FXO	36	Cuamba Airport	Cuamba	Mozambique
FYT	42	Faya Largeau Airport	Faya-largeau	Chad
FYU	52	Fort Yukon Airport	Fort Yukon	United States
FYV	77	Drake Field	Fayetteville	United States
FZO	237	Bristol Filton Airport	Bristol	United Kingdom
GAD	77	Northeast Alabama Regional Airport	Gadsden	United States
GAE	49	Gabès Matmata International Airport	Gabes	Tunisia
GAF	49	Gafsa Ksar International Airport	Gafsa	Tunisia
GAH	209	Gayndah Airport	Gayndah	Australia
GAI	112	Montgomery County Airpark	Gaithersburg	United States
GAJ	193	Yamagata Airport	Yamagata	Japan
GAL	52	Edward G. Pitka Sr Airport	Galena	United States
GAM	52	Gambell Airport	Gambell	United States
GAN	269	Gan International Airport	Gan Island	Maldives
GAO	96	Mariana Grajales Airport	Guantanamo	Cuba
GAQ	5	Gao Airport	Gao	Mali
GAS	41	Garissa Airport	Garissa	Kenya
GAU	150	Lokpriya Gopinath Bordoloi International Airport	Guwahati	India
GAY	150	Gaya Airport	Gaya	India
GBA	237	Cotswold Airport	Pailton	United Kingdom
GBB	145	Gabala International Airport	Qabala	Azerbaijan
GBD	77	Great Bend Municipal Airport	Great Bend	United States
GBE	21	Sir Seretse Khama International Airport	Gaberone	Botswana
GBJ	91	Les Bases Airport	Grand Bourg	Guadeloupe
GBK	20	Gbangbatok Airport	Gbangbatok	Sierra Leone
GBT	191	Gorgan Airport	Gorgan	Iran
GBZ	274	Great Barrier Aerodrome	Claris	New Zealand
GCC	83	Gillette Campbell County Airport	Gillette	United States
GCH	191	Gachsaran Airport	Gachsaran	Iran
GCI	228	Guernsey Airport	Guernsey	Guernsey
GCJ	23	Grand Central Airport	Johannesburg	South Africa
GCK	77	Garden City Regional Airport	Garden City	United States
GCM	76	Owen Roberts International Airport	Georgetown	Cayman Islands
GCN	115	Grand Canyon National Park Airport	Grand Canyon	United States
GDE	2	Gode Airport	Gode	Ethiopia
GDL	107	Don Miguel Hidalgo Y Costilla International Airport	Guadalajara	Mexico
GDN	260	Gdańsk Lech Wałęsa Airport	Gdansk	Poland
GDO	73	Guasdalito Airport	Guasdualito	Venezuela
GDQ	2	Gonder Airport	Gondar	Ethiopia
GDT	89	JAGS McCartney International Airport	Cockburn Town	Turks and Caicos Islands
GDV	83	Dawson Community Airport	Glendive	United States
GDW	112	Gladwin Zettel Memorial Airport	Gladwin	United States
GDX	188	Sokol Airport	Magadan	Russia
GDZ	243	Gelendzhik Airport	Gelendzhik	Russia
GEA	294	Nouméa Magenta Airport	Noumea	New Caledonia
GED	112	Sussex County Airport	Georgetown	United States
GEG	102	Spokane International Airport	Spokane	United States
GEL	123	Santo Ângelo Airport	Santo Angelo	Brazil
GEO	94	Cheddi Jagan International Airport	Georgetown	Guyana
GER	96	Rafael Cabrera Airport	Nueva Gerona	Cuba
GES	172	General Santos International Airport	Romblon	Philippines
GET	214	Geraldton Airport	Geraldton	Australia
GEV	255	Gällivare Airport	Gallivare	Sweden
GEX	211	Geelong Airport	Geelong	Australia
GFF	215	Griffith Airport	Griffith	Australia
GFK	77	Grand Forks International Airport	Grand Forks	United States
GFL	112	Floyd Bennett Memorial Airport	Queensbury	United States
GFN	215	Grafton Airport	Grafton	Australia
GFO	94	Bartica A Airport	Bartica	Guyana
GFR	245	Granville Airport	Granville	France
GFY	50	Grootfontein Airport	Grootfontein	Namibia
GGE	112	Georgetown County Airport	Georgetown	United States
GGG	77	East Texas Regional Airport	Longview	United States
GGM	41	Kakamega Airport	Kakamega	Kenya
GGS	56	Gobernador Gregores Airport	Gobernador Gregores	Argentina
GGT	111	Exuma International Airport	Great Exuma	Bahamas
GGW	83	Wokal Field Glasgow International Airport	Glasgow	United States
GHA	3	Noumérat - Moufdi Zakaria Airport	Ghardaia	Algeria
GHB	111	Governor's Harbour Airport	Governor's Harbor	Bahamas
GHC	111	Great Harbour Cay Airport	Bullocks Harbour	Bahamas
GHF	219	[Duplicate] Giebelstadt Army Air Field	Giebelstadt	Germany
GHT	48	Ghat Airport	Ghat	Libya
GHU	79	Gualeguaychu Airport	Gualeguaychu	Argentina
GIB	227	Gibraltar Airport	Gibraltar	Gibraltar
GIC	209	Boigu Airport	Boigu	Australia
GIF	112	Winter Haven Regional Airport - Gilbert Field	Winter Haven	United States
GIG	123	Rio Galeão – Tom Jobim International Airport	Rio De Janeiro	Brazil
GIL	165	Gilgit Airport	Gilgit	Pakistan
GIR	69	Santiago Vila Airport	Girardot	Colombia
GIS	274	Gisborne Airport	Gisborne	New Zealand
GIU	151	Sigiriya Air Force Base	Sigiriya	Sri Lanka
GIZ	182	Jizan Regional Airport	Gizan	Saudi Arabia
GJA	130	La Laguna Airport	Guanaja	Honduras
GJL	3	Jijel Ferhat Abbas Airport	Jijel	Algeria
GJM	68	Guajará-Mirim Airport	Guajara-mirim	Brazil
GJR	205	Gjögur Airport	Gjogur	Iceland
GJT	83	Grand Junction Regional Airport	Grand Junction	United States
GKA	298	Goroka Airport	Goroka	Papua New Guinea
GKE	219	Geilenkirchen Air Base	Geilenkirchen	Germany
GKK	269	Kooddoo Airport	Kooddoo	Maldives
GKL	209	Great Keppel Is Airport	Great Keppel Island	Australia
GKN	52	Gulkana Airport	Gulkana	United States
GLA	237	Glasgow International Airport	Glasgow	United Kingdom
GLD	83	Renner Field-Goodland Municipal Airport	Goodland	United States
GLF	80	Golfito Airport	Golfito	Costa Rica
GLH	77	Mid Delta Regional Airport	Greenville	United States
GLI	215	Glen Innes Airport	Glen Innes	Australia
GLK	39	Galcaio Airport	Galcaio	Somalia
GLO	237	Gloucestershire Airport	Golouchestershire	United Kingdom
GLS	77	Scholes International At Galveston Airport	Galveston	United States
GLT	209	Gladstone Airport	Gladstone	Australia
GLV	52	Golovin Airport	Golovin	United States
GLZ	216	Gilze Rijen Air Base	Gilze-rijen	Netherlands
GMA	28	Gemena Airport	Gemena	Congo (Kinshasa)
GMB	2	Gambella Airport	Gambella	Ethiopia
GMD	13	Ben Slimane Airport	Ben Slimane	Morocco
GME	242	Gomel Airport	Gomel	Belarus
GML	234	Gostomel Airport	Kiev	Ukraine
GMP	185	Gimpo International Airport	Seoul	South Korea
GMR	282	Totegegie Airport	Totegegie	French Polynesia
GMV	83	Monument Valley Airport	Monument Valley	United States
GMZ	202	La Gomera Airport	La Gomera	Spain
GNA	242	Hrodna Airport	Hrodna	Belarus
GNB	245	Grenoble-Isère Airport	Grenoble	France
GND	90	Point Salines International Airport	Point Salines	Grenada
GNI	189	Lyudao Airport	Green Island	Taiwan
GNM	87	Guanambi Airport	Guanambi	Brazil
GNR	57	Dr. Arturo H. Illia Airport	Fuerte Gral Roca	Argentina
GNS	161	Binaka Airport	Gunung Sitoli	Indonesia
GNT	83	Grants-Milan Municipal Airport	Grants	United States
GNV	112	Gainesville Regional Airport	Gainesville	United States
GNY	231	Şanlıurfa GAP Airport	Sanliurfa	Turkey
GNZ	21	Ghanzi Airport	Ghanzi	Botswana
GOA	249	Genoa Cristoforo Colombo Airport	Genoa	Italy
GOB	2	Robe Airport	Goba	Ethiopia
GOH	88	Godthaab / Nuuk Airport	Godthaab	Greenland
GOI	150	Dabolim Airport	Goa	India
GOJ	243	Nizhny Novgorod Strigino International Airport	Nizhniy Novgorod	Russia
GOM	27	Goma International Airport	Goma	Congo (Kinshasa)
GON	112	Groton New London Airport	Groton CT	United States
GOP	150	Gorakhpur Airport	Gorakhpur	India
GOQ	186	Golmud Airport	Golmud	China
GOR	2	Gore Airport	Gore	Ethiopia
GOT	255	Gothenburg-Landvetter Airport	Gothenborg	Sweden
GOU	18	Garoua International Airport	Garoua	Cameroon
GOV	210	Gove Airport	Gove	Australia
GOZ	254	Gorna Oryahovitsa Airport	Gorna Orechovica	Bulgaria
GPA	217	Araxos Airport	Patras	Greece
GPB	123	Tancredo Thomas de Faria Airport	Guarapuava	Brazil
GPI	69	Juan Casiano Airport	Guapi	Colombia
GPL	80	Guapiles Airport	Guapiles	Costa Rica
GPO	57	General Pico Airport	General Pico	Argentina
GPS	281	Seymour Airport	Galapagos	Ecuador
GPT	77	Gulfport Biloxi International Airport	Gulfport	United States
GPZ	77	Grand Rapids Itasca Co-Gordon Newstrom field	Grand Rapids MN	United States
GQQ	112	Galion Municipal Airport	Galion	United States
GRB	77	Austin Straubel International Airport	Green Bay	United States
GRF	102	Gray Army Air Field	Fort Lewis	United States
GRI	77	Central Nebraska Regional Airport	Grand Island	United States
GRJ	23	George Airport	George	South Africa
GRK	77	Robert Gray  Army Air Field Airport	Killeen	United States
GRM	77	Grand Marais Cook County Airport	Grand Marais	United States
GRO	239	Girona Airport	Gerona	Spain
GRP	87	Gurupi Airport	Gurupi	Brazil
GRQ	216	Eelde Airport	Groningen	Netherlands
GRR	112	Gerald R. Ford International Airport	Grand Rapids	United States
GRS	249	Grosseto Air Base	Grosseto	Italy
GRU	123	Guarulhos - Governador André Franco Montoro International Airport	Sao Paulo	Brazil
GRW	200	Graciosa Airport	Graciosa Island	Portugal
GRX	239	Federico Garcia Lorca Airport	Granada	Spain
GRY	205	Grímsey Airport	Grímsey	Iceland
GRZ	258	Graz Airport	Graz	Austria
GSB	112	Seymour Johnson Air Force Base	Goldsboro	United States
GSE	255	Gothenburg City Airport	Gothenborg	Sweden
GSI	75	Grand-Santi Airport	Grand-Santi	French Guiana
GSJ	92	San José Airport	San Jose	Guatemala
GSO	112	Piedmont Triad International Airport	Greensboro	United States
GSP	112	Greenville Spartanburg International Airport	Greenville	United States
GSQ	12	Shark El Oweinat International Airport	Sharq Al-Owainat	Egypt
GST	52	Gustavus Airport	Gustavus	United States
GTE	210	Groote Eylandt Airport	Groote Eylandt	Australia
GTF	83	Great Falls International Airport	Great Falls	United States
GTI	219	Rügen Airport	Ruegen	Germany
GTN	274	Glentanner Airport	Glentanner	New Zealand
GTO	171	Jalaluddin Airport	Gorontalo	Indonesia
GTR	77	Golden Triangle Regional Airport	Columbus Mississippi	United States
GUA	92	La Aurora Airport	Guatemala City	Guatemala
GUB	132	Guerrero Negro Airport	Guerrero Negro	Mexico
GUC	83	Gunnison Crested Butte Regional Airport	Gunnison	United States
GUF	77	Jack Edwards Airport	Gulf Shores	United States
GUI	73	Guiria Airport	Guiria	Venezuela
GUJ	123	Guaratinguetá Airport	Guaratingueta	Brazil
GUL	215	Goulburn Airport	Goulburn	Australia
GUM	284	Antonio B. Won Pat International Airport	Agana	Guam
GUP	83	Gallup Municipal Airport	Gallup	United States
GUQ	73	Guanare Airport	Guanare	Venezuela
GUR	298	Gurney Airport	Gurney	Papua New Guinea
GUS	112	Grissom Air Reserve Base	Peru	United States
GUT	219	Gütersloh Air Base	Guetersloh	Germany
GUW	176	Atyrau Airport	Atyrau	Kazakhstan
GUX	150	Guna Airport	Guna	India
GVA	245	Geneva Cointrin International Airport	Geneva	Switzerland
GVL	112	Lee Gilmer Memorial Airport	Gainesville	United States
GVR	123	Coronel Altino Machado de Oliveira Airport	Governador Valadares	Brazil
GVT	77	Majors Airport	Greenvile	United States
GVX	255	Gävle Sandviken Airport	Gavle	Sweden
GWD	165	Gwadar International Airport	Gwadar	Pakistan
GWE	22	Thornhill Air Base	Gwert	Zimbabwe
GWL	150	Gwalior Airport	Gwalior	India
GWO	77	Greenwood–Leflore Airport	Greenwood	United States
GWT	219	Westerland Sylt Airport	Westerland	Germany
GWY	226	Galway Airport	Galway	Ireland
GXF	139	Sayun International Airport	Sayun Intl	Yemen
GXG	32	Negage Airport	Negage	Angola
GXH	186	Gannan Xiahe Airport	Xiahe city	China
GXQ	121	Teniente Vidal Airport	Coyhaique	Chile
GYA	100	Capitán de Av. Emilio Beltrán Airport	Guayaramerín	Bolivia
GYD	145	Heydar Aliyev International Airport	Baku	Azerbaijan
GYE	93	José Joaquín de Olmedo International Airport	Guayaquil	Ecuador
GYG	197	Magan Airport	Yakutsk	Russia
GYI	27	Gisenyi Airport	Gisenyi	Rwanda
GYL	214	Argyle Airport	Argyle	Australia
GYM	97	General José María Yáñez International Airport	Guaymas	Mexico
GYN	123	Santa Genoveva Airport	Goiania	Brazil
GYR	115	Phoenix Goodyear Airport	Goodyear	United States
GYS	186	Guangyuan Airport	Guangyuan	China
GYU	186	Guyuan Liupanshan Airport	Guyuan	China
GYY	77	Gary Chicago International Airport	Gary	United States
GZA	157	Yasser Arafat International Airport	Gaza	Palestine
GZM	240	Xewkija Heliport	Gozo	Malta
GZO	283	Nusatupe Airport	Gizo	Solomon Islands
GZP	231	Gazipaşa Airport	Alanya	Turkey
GZT	231	Gaziantep International Airport	Gaziantep	Turkey
GZW	191	Qazvin Airport	Ghazvin	Iran
HAA	244	Hasvik Airport	Hasvik	Norway
HAC	193	Hachijojima Airport	Hachijojima	Japan
HAD	255	Halmstad Airport	Halmstad	Sweden
HAH	267	Prince Said Ibrahim International Airport	Moroni	Comoros
HAJ	219	Hannover Airport	Hannover	Germany
HAK	186	Haikou Meilan International Airport	Haikou	China
HAM	219	Hamburg Airport	Hamburg	Germany
HAN	183	Noi Bai International Airport	Hanoi	Vietnam
HAO	112	Butler Co Regional Airport - Hogan Field	Hamilton	United States
HAQ	269	Hanimaadhoo Airport	Haa Dhaalu Atoll	Maldives
HAR	112	Capital City Airport	Harrisburg	United States
HAS	182	Ha'il Airport	Hail	Saudi Arabia
HAU	244	Haugesund Airport	Haugesund	Norway
HAV	96	José Martí International Airport	Havana	Cuba
HAW	237	Haverfordwest Airport	Haverfordwest	United Kingdom
HBA	213	Hobart International Airport	Hobart	Australia
HBE	12	Borg El Arab International Airport	Alexandria	Egypt
HBG	77	Hattiesburg Bobby L Chain Municipal Airport	Hattiesburg	United States
HBR	77	Hobart Regional Airport	Hobart	United States
HBX	150	Hubli Airport	Hubli	India
HCN	189	Hengchun Airport	Hengchun	Taiwan
HCQ	214	Halls Creek Airport	Halls Creek	Australia
HCR	52	Holy Cross Airport	Holy Cross	United States
HCW	112	Cheraw Municipal Airport/Lynch Bellinger Field	Cheraw	United States
HDD	165	Hyderabad Airport	Hyderabad	Pakistan
HDF	219	Heringsdorf Airport	Heringsdorf	Germany
HDG	186	Handan Airport	Handan	China
HDH	285	Dillingham Airfield	Dillingham	United States
HDI	112	Hardwick Field	Cleveland	United States
HDM	191	Hamadan Airport	Hamadan	Iran
HDN	83	Yampa Valley Airport	Hayden	United States
HDR	191	Havadarya Airport	Bandar Abbas	Iran
HDS	23	Hoedspruit Air Force Base Airport	Hoedspruit	South Africa
HDY	146	Hat Yai International Airport	Hat Yai	Thailand
HEA	164	Herat Airport	Herat	Afghanistan
HEH	181	Heho Airport	Heho	Burma
HEI	219	Heide-Büsum Airport	Büsum	Germany
HEK	186	Heihe Airport	Heihe	China
HEL	229	Helsinki Vantaa Airport	Helsinki	Finland
HEM	229	Helsinki Malmi Airport	Helsinki	Finland
HER	217	Heraklion International Nikos Kazantzakis Airport	Heraklion	Greece
HET	186	Baita International Airport	Hohhot	China
HEW	217	Athen Helenikon Airport	Athens	Greece
HEX	122	Herrera Airport	Santo Domingo	Dominican Republic
HFA	163	Haifa International Airport	Haifa	Israel
HFD	112	Hartford Brainard Airport	Hartford	United States
HFE	186	Hefei Luogang International Airport	Hefei	China
HFN	205	Hornafjörður Airport	Hofn	Iceland
HFS	255	Hagfors Airport	Hagfors	Sweden
HFT	244	Hammerfest Airport	Hammerfest	Norway
HGA	39	Egal International Airport	Hargeisa	Somalia
HGD	209	Hughenden Airport	Hughenden	Australia
HGE	73	Higuerote Airport	Higuerote	Venezuela
HGH	186	Hangzhou Xiaoshan International Airport	Hangzhou	China
HGL	219	Helgoland-Düne Airport	Helgoland	Germany
HGN	146	Mae Hong Son Airport	Mae Hong Son	Thailand
HGO	0	Korhogo Airport	Korhogo	Cote d'Ivoire
HGR	112	Hagerstown Regional Richard A Henson Field	Hagerstown	United States
HGS	20	Hastings Airport	Freetown	Sierra Leone
HGU	298	Mount Hagen Kagamuga Airport	Mount Hagen	Papua New Guinea
HHE	193	Hachinohe Airport	Hachinoe	Japan
HHH	112	Hilton Head Airport	Hilton Head Island	United States
HHI	285	Wheeler Army Airfield	Wahiawa	United States
HHN	219	Frankfurt-Hahn Airport	Hahn	Germany
HHP	158	Shun Tak Heliport	Hong Kong	Hong Kong
HHQ	146	Hua Hin Airport	Prachuap Khiri Khan	Thailand
HHR	102	Jack Northrop Field Hawthorne Municipal Airport	Hawthorne	United States
HIA	186	Lianshui Airport	Huai An	China
HIB	77	Range Regional Airport	Hibbing	United States
HID	209	Horn Island Airport	Horn Island	Australia
HIF	83	Hill Air Force Base	Ogden	United States
HII	115	Lake Havasu City Airport	Lake Havasu City	United States
HIJ	193	Hiroshima Airport	Hiroshima	Japan
HIN	185	Sacheon Air Base/Airport	Sacheon	South Korea
HIO	102	Portland Hillsboro Airport	Hillsboro	United States
HIR	283	Honiara International Airport	Honiara	Solomon Islands
HIW	193	Hiroshimanishi Airport	Hiroshima	Japan
HJJ	186	Zhijiang Airport	Zhijiang	China
HJR	150	Khajuraho Airport	Khajuraho	India
HKD	193	Hakodate Airport	Hakodate	Japan
HKG	158	Hong Kong International Airport	Hong Kong	Hong Kong
HKK	274	Hokitika Airfield	Hokitika	New Zealand
HKN	298	Kimbe Airport	Hoskins	Papua New Guinea
HKT	146	Phuket International Airport	Phuket	Thailand
HKY	112	Hickory Regional Airport	Hickory	United States
HLA	23	Lanseria Airport	Johannesburg	South Africa
HLD	186	Dongshan Airport	Hailar	China
HLF	255	Hultsfred Airport	Hultsfred	Sweden
HLG	112	Wheeling Ohio County Airport	Wheeling	United States
HLH	186	Ulanhot Airport	Ulanhot	China
HLJ	259	Barysiai Airport	Barysiai	Lithuania
HLN	83	Helena Regional Airport	Helena	United States
HLP	161	Halim Perdanakusuma International Airport	Jakarta	Indonesia
HLR	77	Hood Army Air Field	Fort Hood	United States
HLT	211	Hamilton Airport	Hamilton	Australia
HLZ	274	Hamilton International Airport	Hamilton	New Zealand
HMA	198	Khanty Mansiysk Airport	Khanty-Mansiysk	Russia
HMB	12	Sohag International Airport	Sohag	Egypt
HME	3	Oued Irara Airport	Hassi Messaoud	Algeria
HMI	186	Hami Airport	Hami	China
HMJ	234	Khmelnytskyi Airport	Khmeinitskiy	Ukraine
HMN	83	Holloman Air Force Base	Alamogordo	United States
HMO	97	General Ignacio P. Garcia International Airport	Hermosillo	Mexico
HMR	244	Stafsberg Airport	Hamar	Norway
HMV	255	Hemavan Airport	Hemavan	Sweden
HNA	193	Hanamaki Airport	Hanamaki	Japan
HND	193	Tokyo Haneda International Airport	Tokyo	Japan
HNH	52	Hoonah Airport	Hoonah	United States
HNL	285	Daniel K Inouye International Airport	Honolulu	United States
HNM	285	Hana Airport	Hana	United States
HNS	52	Haines Airport	Haines	United States
HOA	41	Hola Airport	Hola	Kenya
HOB	83	Lea County Regional Airport	Hobbs	United States
HOD	139	Hodeidah International Airport	Hodeidah	Yemen
HOE	195	Ban Huoeisay Airport	Huay Xai	Laos
HOF	182	Al Ahsa Airport	Al-ahsa	Saudi Arabia
HOG	96	Frank Pais International Airport	Holguin	Cuba
HOH	258	Hohenems-Dornbirn Airport	Hohenems	Austria
HOK	210	Hooker Creek Airport	Hooker Creek	Australia
HOM	52	Homer Airport	Homer	United States
HON	77	Huron Regional Airport	Huron	United States
HOP	77	Campbell AAF (Fort Campbell) Air Field	Hopkinsville	United States
HOQ	219	Hof-Plauen Airport	Hof	Germany
HOR	200	Horta Airport	Horta	Portugal
HOS	57	Chos Malal Airport	Chosmadal	Argentina
HOT	77	Memorial Field	Hot Springs	United States
HOU	77	William P Hobby Airport	Houston	United States
HOV	244	Ørsta-Volda Airport, Hovden	Orsta-Volda	Norway
HOX	181	Hommalinn Airport	Hommalin	Burma
HPA	303	Lifuka Island Airport	Lifuka	Tonga
HPB	52	Hooper Bay Airport	Hooper Bay	United States
HPH	183	Cat Bi International Airport	Haiphong	Vietnam
HPN	112	Westchester County Airport	White Plains	United States
HQM	102	Bowerman Airport	Hoquiam	United States
HRB	186	Taiping Airport	Harbin	China
HRE	22	Robert Gabriel Mugabe International Airport	Harare	Zimbabwe
HRG	12	Hurghada International Airport	Hurghada	Egypt
HRI	151	Mattala Rajapaksa International Airport	Mattala	Sri Lanka
HRK	234	Kharkiv International Airport	Kharkov	Ukraine
HRL	77	Valley International Airport	Harlingen	United States
HRM	3	Hassi R'Mel Airport	Tilrempt	Algeria
HRO	77	Boone County Airport	Harrison	United States
HRS	23	Harrismith Airport	Harrismith	South Africa
HRT	237	RAF Linton-On-Ouse	Linton-on-ouse	United Kingdom
HSG	193	Saga Airport	Saga	Japan
HSH	102	Henderson Executive Airport	Henderson	United States
HSK	239	Huesca/Pirineos Airport	Huesca	Spain
HSL	52	Huslia Airport	Huslia	United States
HSN	186	Zhoushan Airport	Zhoushan	China
HSS	150	Hissar Airport	Hissar	India
HST	112	Homestead ARB Airport	Homestead	United States
HSV	77	Huntsville International Carl T Jones Field	Huntsville	United States
HSZ	189	Hsinchu Air Base	Hsinchu	Taiwan
HTA	197	Chita-Kadala Airport	Chita	Russia
HTG	167	Khatanga Airport	Khatanga	Russia
HTI	209	Hamilton Island Airport	Hamilton Island	Australia
HTL	112	Roscommon County - Blodgett Memorial Airport	Houghton Lake	United States
HTN	186	Hotan Airport	Hotan	China
HTS	112	Tri-State/Milton J. Ferguson Field	Huntington	United States
HTY	231	Hatay Airport	Hatay	Turkey
HUA	77	Redstone Army Air Field	Redstone	United States
HUE	2	Humera Airport	Humera	Ethiopia
HUF	112	Terre Haute Regional Airport, Hulman Field	Terre Haute	United States
HUH	301	Huahine-Fare Airport	Huahine Island	French Polynesia
HUI	183	Phu Bai Airport	Hue	Vietnam
HUL	112	Houlton International Airport	Houlton	United States
HUN	189	Hualien Airport	Hualien	Taiwan
HUQ	48	Hon Airport	Hon	Libya
HUS	52	Hughes Airport	Hughes	United States
HUT	77	Hutchinson Municipal Airport	Hutchinson	United States
HUU	101	Alferez Fap David Figueroa Fernandini Airport	Huánuco	Peru
HUV	255	Hudiksvall Airport	Hudiksvall	Sweden
HUW	68	Humaitá Airport	Humaita	Brazil
HUX	107	Bahías de Huatulco International Airport	Huatulco	Mexico
HUY	237	Humberside Airport	Humberside	United Kingdom
HUZ	186	Huizhou Airport	Huizhou	China
HVA	263	Analalava Airport	Analalava	Madagascar
HVB	209	Hervey Bay Airport	Hervey Bay	Australia
HVD	159	Khovd Airport	Khovd	Mongolia
HVG	244	Valan Airport	Honningsvag	Norway
HVN	112	Tweed New Haven Airport	New Haven	United States
HVR	83	Havre City County Airport	Havre	United States
HWD	102	Hayward Executive Airport	Hayward	United States
HWN	22	Hwange National Park Airport	Hwange National Park	Zimbabwe
HWO	112	North Perry Airport	Hollywood	United States
HYA	112	Barnstable Municipal Boardman Polando Field	Barnstable	United States
HYC	237	Wycombe Air Park	Wycombe	United Kingdom
HYG	52	Hydaburg Seaplane Base	Hydaburg	United States
HYN	186	Huangyan Luqiao Airport	Huangyan	China
HYS	77	Hays Regional Airport	Hays	United States
HYV	229	Hyvinkää Airfield	Hyvinkaa	Finland
HZB	245	Merville-Calonne Airport	Merville	France
HZG	186	Hanzhong Chenggu Airport	Hanzhong	China
HZH	186	Liping Airport	Liping	China
HZK	205	Húsavík Airport	Husavik	Iceland
HZL	112	Hazleton Municipal Airport	Hazleton	United States
IAA	167	Igarka Airport	Igarka	Russia
IAB	77	Mc Connell Air Force Base	Wichita	United States
IAD	112	Washington Dulles International Airport	Washington	United States
IAG	112	Niagara Falls International Airport	Niagara Falls	United States
IAH	77	George Bush Intercontinental Houston Airport	Houston	United States
IAM	3	In Aménas Airport	Zarzaitine	Algeria
IAN	52	Bob Baker Memorial Airport	Kiana	United States
IAO	172	Siargao Airport	Siargao	Philippines
IAR	243	Tunoshna Airport	Yaroslavl	Russia
IAS	222	Iaşi Airport	Iasi	Romania
IBA	29	Ibadan Airport	Ibadan	Nigeria
IBB	281	General Villamil Airport	Isabela	Ecuador
IBE	69	Perales Airport	Ibague	Colombia
IBP	101	Iberia Airport	Iberia	Peru
IBR	193	Hyakuri Airport	Ibaraki	Japan
IBZ	239	Ibiza Airport	Ibiza	Spain
ICC	73	Andrés Miguel Salazar Marcano Airport	Isla De Coche	Venezuela
ICI	279	Cicia Airport	Cicia	Fiji
ICK	114	Nieuw Nickerie Airport	Nieuw Nickerie	Suriname
ICN	185	Incheon International Airport	Seoul	South Korea
ICT	77	Wichita Eisenhower National Airport	Wichita	United States
IDA	83	Idaho Falls Regional Airport	Idaho Falls	United States
IDR	150	Devi Ahilyabai Holkar Airport	Indore	India
IDY	245	Île d'Yeu Airport	Île d'Yeu	France
IEG	260	Zielona Góra-Babimost Airport	Zielona Gora	Poland
IES	219	Riesa-Göhlis Airport	Riesa	Germany
IEV	234	Kiev Zhuliany International Airport	Kiev	Ukraine
IFH	191	Hesa Airport	Daran	Iran
IFJ	205	Ísafjörður Airport	Isafjordur	Iceland
IFL	209	Innisfail Airport	Innisfail	Australia
IFN	191	Esfahan Shahid Beheshti International Airport	Esfahan	Iran
IFO	234	Ivano-Frankivsk International Airport	Ivano-Frankivsk	Ukraine
IGA	111	Inagua Airport	Matthew Town	Bahamas
IGB	57	Cabo F.A.A. H. R. Bordón Airport	Ingeniero Jacobacci	Argentina
IGD	231	Iğdır Airport	Igdir	Turkey
IGG	52	Igiugig Airport	Igiugig	United States
IGL	231	Çiğli Airport	Izmir	Turkey
IGR	79	Cataratas Del Iguazú International Airport	Iguazu Falls	Argentina
IGS	219	Ingolstadt Manching Airport	Ingolstadt	Germany
IGT	243	Magas Airport	Magas	Russia
IGU	123	Cataratas International Airport	Foz Do Iguacu	Brazil
IHC	36	Inhaca Airport	Inhaca	Mozambique
IHR	191	Iran Shahr Airport	Iran Shahr	Iran
IIA	226	Inishmaan Aerodrome	Inishmaan	Ireland
IIL	191	Ilam Airport	Ilam	Iran
IJK	250	Izhevsk Airport	Izhevsk	Russia
IKA	191	Imam Khomeini International Airport	Tehran	Iran
IKB	112	Wilkes County Airport	North Wilkesboro	United States
IKI	193	Iki Airport	Iki	Japan
IKK	77	Greater Kankakee Airport	Kankakee	United States
IKO	52	Nikolski Air Station	Nikolski	United States
IKS	197	Tiksi Airport	Tiksi	Russia
IKT	160	Irkutsk Airport	Irkutsk	Russia
ILD	239	Lleida-Alguaire Airport	Lleida	Spain
ILF	136	Ilford Airport	Ilford	Canada
ILG	112	New Castle Airport	Wilmington	United States
ILI	52	Iliamna Airport	Iliamna	United States
ILM	112	Wilmington International Airport	Wilmington	United States
ILN	112	Wilmington Airpark	Wilmington	United States
ILO	172	Iloilo International Airport	Iloilo	Philippines
ILP	294	Île des Pins Airport	Île des Pins	New Caledonia
ILQ	101	Ilo Airport	Ilo	Peru
ILR	29	Ilorin International Airport	Ilorin	Nigeria
ILU	41	Kilaguni Airport	Kilaguni	Kenya
ILY	237	Islay Airport	Islay	United Kingdom
ILZ	220	Žilina Airport	Žilina	Slovakia
IMB	94	Imbaimadai Airport	Imbaimadai	Guyana
IMF	150	Imphal Airport	Imphal	India
IMK	166	Simikot Airport	Simikot	Nepal
IMM	112	Immokalee Regional Airport	Immokalee 	United States
IMP	87	Prefeito Renato Moreira Airport	Imperatriz	Brazil
IMT	77	Ford Airport	Iron Mountain	United States
IND	112	Indianapolis International Airport	Indianapolis	United States
ING	56	Lago Argentino Airport	El Calafate	Argentina
INH	36	Inhambane Airport	Inhambane	Mozambique
INI	218	Nis Airport	Nis	Serbia
INK	77	Winkler County Airport	Wink	United States
INL	77	Falls International Airport	International Falls	United States
INN	258	Innsbruck Airport	Innsbruck	Austria
INO	28	Inongo Airport	Inongo	Congo (Kinshasa)
INQ	226	Inisheer Aerodrome	Inisheer	Ireland
INS	102	Creech Air Force Base	Indian Springs	United States
INT	112	Smith Reynolds Airport	Winston-salem	United States
INU	291	Nauru International Airport	Nauru	Nauru
INV	237	Inverness Airport	Inverness	United Kingdom
INW	115	Winslow Lindbergh Regional Airport	Winslow	United States
INZ	3	In Salah Airport	In Salah	Algeria
IOA	217	Ioannina Airport	Ioannina	Greece
IOM	230	Isle of Man Airport	Isle Of Man	Isle of Man
IOR	226	Inishmore Aerodrome	Inis Mor	Ireland
IOS	87	Bahia - Jorge Amado Airport	Ilheus	Brazil
IOW	77	Iowa City Municipal Airport	Iowa City	United States
IPA	277	Ipota Airport	Ipota	Vanuatu
IPC	276	Mataveri Airport	Easter Island	Chile
IPH	168	Sultan Azlan Shah Airport	Ipoh	Malaysia
IPI	69	San Luis Airport	Ipiales	Colombia
IPL	102	Imperial County Airport	Imperial	United States
IPN	123	Usiminas Airport	Ipatinga	Brazil
IPT	112	Williamsport Regional Airport	Williamsport	United States
IQA	143	Al Asad Air Base	Al Asad	Iraq
IQM	186	Qiemo Yudu Airport	Qiemo	China
IQN	186	Qingyang Airport	Qingyang	China
IQQ	121	Diego Aracena Airport	Iquique	Chile
IQT	101	Coronel FAP Francisco Secada Vignetta International Airport	Iquitos	Peru
IRA	283	Ngorangora Airport	Kirakira	Solomon Islands
IRB	77	Iraan Municipal Airport	Iraan	United States
IRC	52	Circle City /New/ Airport	Circle	United States
IRD	153	Ishurdi Airport	Ishurdi	Bangladesh
IRG	209	Lockhart River Airport	Lockhart River	Australia
IRI	16	Iringa Airport	Iringa	Tanzania
IRJ	55	Capitan V A Almonacid Airport	La Rioja	Argentina
IRK	77	Kirksville Regional Airport	Kirksville	United States
IRP	33	Matari Airport	Isiro	Congo (Kinshasa)
IRZ	68	Tapuruquara Airport	Santa Isabel do Rio Negro	Brazil
ISA	209	Mount Isa Airport	Mount Isa	Australia
ISC	237	St. Mary's Airport	ST MARY'S	United Kingdom
ISE	231	Süleyman Demirel International Airport	Isparta	Turkey
ISG	193	New Ishigaki Airport	Ishigaki	Japan
ISJ	72	Isla Mujeres Airport	Isla Mujeres	Mexico
ISK	150	Nashik Airport	Nasik Road	India
ISL	231	Atatürk International Airport	Istanbul	Turkey
ISM	112	Kissimmee Gateway Airport	Kissimmee	United States
ISN	77	Sloulin Field International Airport	Williston	United States
ISO	112	Kinston Regional Jetport At Stallings Field	Kinston	United States
ISP	112	Long Island Mac Arthur Airport	Islip	United States
ISU	143	Sulaymaniyah International Airport	Sulaymaniyah	Iraq
ISW	77	Alexander Field South Wood County Airport	Wisconsin Rapids	United States
ITA	68	Itacoatiara Airport	Itaituba	Brazil
ITB	65	Itaituba Airport	Itaituba	Brazil
ITH	112	Ithaca Tompkins Regional Airport	Ithaca	United States
ITM	193	Osaka International Airport	Osaka	Japan
ITO	285	Hilo International Airport	Hilo	United States
ITR	123	Francisco Vilela do Amaral Airport	Itumbiara	Brazil
IUE	292	Niue International Airport	Alofi	Niue
IVA	263	Ampampamena Airport	Ampampamena	Madagascar
IVC	274	Invercargill Airport	Invercargill	New Zealand
IVL	229	Ivalo Airport	Ivalo	Finland
IVR	215	Inverell Airport	Inverell	Australia
IWA	243	Ivanovo South Airport	Ivanovo	Russia
IWJ	193	Iwami Airport	Iwami	Japan
IWO	193	Iwo Jima Airport	Iwojima	Japan
IWS	77	West Houston Airport	Houston	United States
IXA	150	Agartala Airport	Agartala	India
IXB	150	Bagdogra Airport	Baghdogra	India
IXC	150	Chandigarh Airport	Chandigarh	India
IXD	150	Allahabad Airport	Allahabad	India
IXE	150	Mangalore International Airport	Mangalore	India
IXG	150	Belgaum Airport	Belgaum	India
IXH	150	Kailashahar Airport	Kailashahar	India
IXI	150	North Lakhimpur Airport	Lilabari	India
IXJ	150	Jammu Airport	Jammu	India
IXK	150	Keshod Airport	Keshod	India
IXL	150	Leh Kushok Bakula Rimpochee Airport	Leh	India
IXM	150	Madurai Airport	Madurai	India
IXP	150	Pathankot Airport	Pathankot	India
IXR	150	Birsa Munda Airport	Ranchi	India
IXS	150	Silchar Airport	Silchar	India
IXU	150	Aurangabad Airport	Aurangabad	India
IXV	150	Along Airport	Along	India
IXW	150	Sonari Airport	Jamshedpur	India
IXY	150	Kandla Airport	Kandla	India
IXZ	150	Vir Savarkar International Airport	Port Blair	India
IYK	102	Inyokern Airport	Inyokern	United States
IZA	123	Zona da Mata Regional Airport	Juiz de Fora	Brazil
IZO	193	Izumo Airport	Izumo	Japan
IZT	107	Ixtepec Airport	Iztepec	Mexico
JAA	164	Jalalabad Airport	Jalalabad	Afghanistan
JAB	210	Jabiru Airport	Jabiru	Australia
JAC	83	Jackson Hole Airport	Jacksn Hole	United States
JAD	214	Perth Jandakot Airport	Perth	Australia
JAF	151	Kankesanturai Airport	Jaffna	Sri Lanka
JAG	165	Shahbaz Air Base	Jacobsbad	Pakistan
JAI	150	Jaipur International Airport	Jaipur	India
JAK	116	Jacmel Airport	Jacmel	Haiti
JAL	107	El Lencero Airport	Jalapa	Mexico
JAN	77	Jackson-Medgar Wiley Evers International Airport	Jackson	United States
JAP	80	Chacarita Airport	Chacarita	Costa Rica
JAR	191	Jahrom Airport	Jahrom	Iran
JAU	101	Francisco Carle Airport	Jauja	Peru
JAV	88	Ilulissat Airport	Ilulissat	Greenland
JAX	112	Jacksonville International Airport	Jacksonville	United States
JBQ	122	La Isabela International Airport	La Isabela	Dominican Republic
JBR	77	Jonesboro Municipal Airport	Jonesboro	United States
JCB	123	Santa Terezinha Airport	Joacaba	Brazil
JCH	88	Qasigiannguit Heliport	Qasigiannguit	Greenland
JCI	77	New Century Aircenter Airport	Olathe	United States
JCK	209	Julia Creek Airport	Julia Creek	Australia
JCR	65	Jacareacanga Airport	Jacare-acanga	Brazil
JDF	123	Francisco de Assis Airport	Juiz De Fora	Brazil
JDG	185	Jeongseok Airport	Seogwipo	South Korea
JDH	150	Jodhpur Airport	Jodhpur	India
JDO	87	Orlando Bezerra de Menezes Airport	Juazeiro Do Norte	Brazil
JDZ	186	Jingdezhen Airport	Jingdezhen	China
JED	182	King Abdulaziz International Airport	Jeddah	Saudi Arabia
JEE	116	Jérémie Airport	Jeremie	Haiti
JEF	77	Jefferson City Memorial Airport	Jefferson City	United States
JEG	88	Aasiaat Airport	Aasiaat	Greenland
JER	232	Jersey Airport	Jersey	Jersey
JFK	112	John F Kennedy International Airport	New York	United States
JFR	88	Paamiut Heliport	Paamiut	Greenland
JGA	150	Jamnagar Airport	Jamnagar	India
JGD	186	Jiagedaqi Airport	Jiagedaqi District	China
JGN	186	Jiayuguan Airport	Jiayuguan	China
JGO	88	Qeqertarsuaq Heliport	Qeqertarsuaq Airport	Greenland
JGS	186	Jinggangshan Airport	Jian	China
JHB	168	Senai International Airport	Johor Bahru	Malaysia
JHG	186	Xishuangbanna Gasa Airport	Jinghonggasa	China
JHM	285	Kapalua Airport	Lahania-kapalua	United States
JHQ	209	Shute Harbour Airport	Shute Harbour	Australia
JHS	88	Sisimiut Airport	Sisimiut	Greenland
JHW	112	Chautauqua County-Jamestown Airport	Jamestown	United States
JIB	17	Djibouti-Ambouli Airport	Djibouti	Djibouti
JIJ	2	Wilwal International Airport	Jijiga	Ethiopia
JIK	217	Ikaria Airport	Ikaria	Greece
JIM	2	Jimma Airport	Jimma	Ethiopia
JIQ	186	Qianjiang Wulingshan Airport	Qianjiang	China
JIU	186	Jiujiang Lushan Airport	Jiujiang	China
JIW	165	Jiwani Airport	Jiwani	Pakistan
JJI	101	Juanjui Airport	Juanjui	Peru
JJM	41	Mulika Lodge Airport	Meru National Park	Kenya
JJN	186	Quanzhou Jinjiang International Airport	Quanzhou	China
JJU	88	Qaqortoq Heliport	Qaqortoq	Greenland
JKG	255	Jönköping Airport	Joenkoeping	Sweden
JKH	217	Chios Island National Airport	Chios	Greece
JKL	217	Kalymnos Airport	Kalymnos	Greece
JKR	166	Janakpur Airport	Janakpur	Nepal
JLN	77	Joplin Regional Airport	Joplin	United States
JLR	150	Jabalpur Airport	Jabalpur	India
JMK	217	Mikonos Airport	Mykonos	Greece
JMO	166	Jomsom Airport	Jomsom	Nepal
JMS	77	Jamestown Regional Airport	Jamestown	United States
JMU	186	Jiamusi Airport	Jiamusi	China
JNB	23	OR Tambo International Airport	Johannesburg	South Africa
JNG	186	Jining Qufu Airport	Jining	China
JNI	70	Junin Airport	Junin	Argentina
JNN	88	Nanortalik Heliport	Nanortalik	Greenland
JNS	88	Narsaq Heliport	Narsaq	Greenland
JNU	52	Juneau International Airport	Juneau	United States
JNX	217	Naxos Airport	Cyclades Islands	Greece
JNZ	186	Jinzhou Airport	Jinzhou	China
JOE	229	Joensuu Airport	Joensuu	Finland
JOG	161	Adi Sutjipto International Airport	Yogyakarta	Indonesia
JOH	23	Port St Johns Airport	Port Saint Johns	South Africa
JOI	123	Lauro Carneiro de Loyola Airport	Joinville	Brazil
JOK	243	Yoshkar-Ola Airport	Yoshkar-Ola	Russia
JOL	172	Jolo Airport	Jolo	Philippines
JON	286	Johnston Atoll Airport	Johnston Island	Johnston Atoll
JOS	29	Yakubu Gowon Airport	Jos	Nigeria
JOT	77	Joliet Regional Airport	Joliet	United States
JPA	87	Presidente Castro Pinto International Airport	Joao Pessoa	Brazil
JPR	68	Ji-Paraná Airport	Ji-Paraná	Brazil
JQA	88	Qaarsut Airport	Uummannaq	Greenland
JQE	113	Jaqué Airport	Jaqué	Panama
JRA	112	West 30th St. Heliport	New York	United States
JRB	112	Downtown-Manhattan/Wall St Heliport	New York	United States
JRF	285	Kalaeloa Airport	Kapolei	United States
JRH	150	Jorhat Airport	Jorhat	India
JRO	16	Kilimanjaro International Airport	Kilimanjaro	Tanzania
JSA	150	Jaisalmer Airport	Jaisalmer	India
JSH	217	Sitia Airport	Sitia	Greece
JSI	217	Skiathos Island National Airport	Skiathos	Greece
JSM	74	Jose De San Martin Airport	Jose de San Martin	Argentina
JSR	153	Jessore Airport	Jessore	Bangladesh
JST	112	John Murtha Johnstown Cambria County Airport	Johnstown	United States
JSU	88	Maniitsoq Airport	Maniitsoq	Greenland
JSY	217	Syros Airport	Syros Island	Greece
JTC	123	Bauru - Arealva Airport	Bauru	Brazil
JTR	217	Santorini Airport	Thira	Greece
JTY	217	Astypalaia Airport	Astypalaia	Greece
JUB	24	Juba International Airport	Juba	South Sudan
JUH	186	Jiuhuashan Airport	Chizhou	China
JUI	219	Juist Airport	Juist	Germany
JUJ	99	Gobernador Horacio Guzman International Airport	Jujuy	Argentina
JUL	101	Inca Manco Capac International Airport	Juliaca	Peru
JUM	166	Jumla Airport	Jumla	Nepal
JUV	88	Upernavik Airport	Upernavik	Greenland
JUZ	186	Quzhou Airport	Quzhou	China
JVA	263	Ankavandra Airport	Ankavandra	Madagascar
JVL	77	Southern Wisconsin Regional Airport	Janesville	United States
JWA	21	Jwaneng Airport	Jwaneng	Botswana
JWN	191	Zanjan Airport	Zanjan	Iran
JXA	186	Jixi Xingkaihu Airport	Jixi	China
JXN	112	Jackson County Reynolds Field	Jackson	United States
JYR	191	Jiroft Airport	Jiroft	Iran
JYV	229	Jyvaskyla Airport	Jyvaskyla	Finland
JZH	186	Jiuzhai Huanglong Airport	Jiuzhaigou	China
KAA	34	Kasama Airport	Kasama	Zambia
KAB	22	Kariba International Airport	Kariba	Zimbabwe
KAC	152	Kamishly Airport	Kamishly	Syria
KAD	29	Kaduna Airport	Kaduna	Nigeria
KAG	185	Gangneung Airport (K-18)	Kangnung	South Korea
KAI	94	Kaieteur International Airport	Kaieteur	Guyana
KAJ	229	Kajaani Airport	Kajaani	Finland
KAL	52	Kaltag Airport	Kaltag	United States
KAN	29	Mallam Aminu International Airport	Kano	Nigeria
KAO	229	Kuusamo Airport	Kuusamo	Finland
KAR	94	Kamarang Airport	Kamarang	Guyana
KAT	274	Kaitaia Airport	Kaitaia	New Zealand
KAU	229	Kauhava Airport	Kauhava	Finland
KAW	181	Kawthoung Airport	Kawthoung	Burma
KAX	214	Kalbarri Airport	Kalbarri	Australia
KBL	164	Hamid Karzai International Airport	Kabul	Afghanistan
KBP	234	Boryspil International Airport	Kiev	Ukraine
KBQ	9	Kasungu Airport	Kasungu	Malawi
KBR	168	Sultan Ismail Petra Airport	Kota Bahru	Malaysia
KBS	20	Bo Airport	Bo	Sierra Leone
KBV	146	Krabi Airport	Krabi	Thailand
KBZ	274	Kaikoura Airport	Kaikoura	New Zealand
KCA	186	Kuqa Airport	Kuqa	China
KCH	168	Kuching International Airport	Kuching	Malaysia
KCK	160	Kirensk Airport	Kirensk	Russia
KCM	231	Kahramanmaraş Airport	Kahramanmaras	Turkey
KCO	231	Cengiz Topel Airport	Topel	Turkey
KCT	151	Koggala Airport	Koggala	Sri Lanka
KCZ	193	Kōchi Ryōma Airport	Kochi	Japan
KDD	165	Khuzdar Airport	Khuzdar	Pakistan
KDH	164	Kandahar Airport	Kandahar	Afghanistan
KDI	171	Wolter Monginsidi Airport	Kendari	Indonesia
KDL	256	Kärdla Airport	Kardla	Estonia
KDM	269	Kaadedhdhoo Airport	Kaadedhdhoo	Maldives
KDO	269	Kadhdhoo Airport	Laamu Atoll	Maldives
KDT	146	Kamphaeng Saen Airport	Nakhon Pathom	Thailand
KDU	165	Skardu Airport	Skardu	Pakistan
KDV	279	Vunisea Airport	Vunisea	Fiji
KDX	26	Kadugli Airport	Kadugli	Sudan
KDY	197	Typliy Klyuch Airport	Khandyga	Russia
KED	44	Kaédi Airport	Kaedi	Mauritania
KEF	205	Keflavik International Airport	Keflavik	Iceland
KEJ	167	Kemerovo Airport	Kemorovo	Russia
KEL	219	Kiel-Holtenau Airport	Kiel	Germany
KEM	229	Kemi-Tornio Airport	Kemi	Finland
KEN	20	Kenema Airport	Kenema	Sierra Leone
KEP	166	Nepalgunj Airport	Nepalgunj	Nepal
KER	191	Kerman Airport	Kerman	Iran
KET	181	Kengtung Airport	Kengtung	Burma
KEV	229	Halli Airport	Halli	Finland
KEW	136	Keewaywin Airport	Keewaywin	Canada
KEY	41	Kericho Airport	Kericho	Kenya
KFA	44	Kiffa Airport	Kiffa	Mauritania
KFE	214	Fortescue - Dave Forrest Aerodrome	Cloudbreak	Australia
KFG	210	Kalkgurung Airport	Kalkgurung	Australia
KFP	52	False Pass Airport	False Pass	United States
KFS	231	Kastamonu Airport	Kastamonu	Turkey
KGA	33	Kananga Airport	Kananga	Congo (Kinshasa)
KGC	208	Kingscote Airport	Kingscote	Australia
KGD	233	Khrabrovo Airport	Kaliningrad	Russia
KGE	283	Kaghau Airport	Kagau Island	Solomon Islands
KGF	180	Sary-Arka Airport	Karaganda	Kazakhstan
KGG	15	Kédougou Airport	Kedougou	Senegal
KGI	214	Kalgoorlie Boulder Airport	Kalgoorlie	Australia
KGJ	9	Karonga Airport	Karonga	Malawi
KGK	52	Koliganek Airport	Koliganek	United States
KGL	27	Kigali International Airport	Kigali	Rwanda
KGO	234	Kirovograd Airport	Kirovograd	Ukraine
KGP	198	Kogalym International Airport	Kogalym	Russia
KGS	217	Kos Airport	Kos	Greece
KGT	186	Kangding Airport	Kangding	China
KHC	252	Kerch Airport	Kerch	Ukraine
KHD	191	Khoram Abad Airport	Khorram Abad	Iran
KHE	234	Kherson International Airport	Kherson	Ukraine
KHG	186	Kashgar Airport	Kashi	China
KHH	189	Kaohsiung International Airport	Kaohsiung	Taiwan
KHI	165	Jinnah International Airport	Karachi	Pakistan
KHJ	229	Kauhajoki Airport	Kauhajoki	Finland
KHK	191	Khark Island Airport	Khark Island	Iran
KHM	181	Kanti Airport	Khamti	Burma
KHN	186	Nanchang Changbei International Airport	Nanchang	China
KHS	173	Khasab Air Base	Khasab	Oman
KHT	164	Khost Airport	Khost	Afghanistan
KHV	196	Khabarovsk-Novy Airport	Khabarovsk	Russia
KHW	21	Khwai River Lodge Airport	Khwai River	Botswana
KHY	191	Khoy Airport	Khoy	Iran
KID	255	Kristianstad Airport	Kristianstad	Sweden
KIF	133	Kingfisher Lake Airport	Kingfisher Lake	Canada
KIH	191	Kish International Airport	Kish Island	Iran
KIJ	193	Niigata Airport	Niigata	Japan
KIK	143	Kirkuk Air Base	Kirkuk	Iraq
KIM	23	Kimberley Airport	Kimberley	South Africa
KIN	98	Norman Manley International Airport	Kingston	Jamaica
KIO	288	Kili Airport	Kili Island	Marshall Islands
KIR	226	Kerry Airport	Kerry	Ireland
KIS	41	Kisumu Airport	Kisumu	Kenya
KIT	217	Kithira Airport	Kithira	Greece
KIV	224	Chişinău International Airport	Chisinau	Moldova
KIW	34	Southdowns Airport	Southdowns	Zambia
KIX	193	Kansai International Airport	Osaka	Japan
KJA	167	Yemelyanovo Airport	Krasnoyarsk	Russia
KJI	186	Kanas Airport	Burqin	China
KJK	221	Wevelgem Airport	Kortrijk-vevelgem	Belgium
KJP	193	Kerama Airport	Kerama	Japan
KKA	52	Koyuk Alfred Adams Airport	Koyuk	United States
KKC	146	Khon Kaen Airport	Khon Kaen	Thailand
KKE	274	Kerikeri Airport	Kerikeri	New Zealand
KKH	52	Kongiganak Airport	Kongiganak	United States
KKJ	193	Kitakyūshū Airport	Kitakyushu	Japan
KKN	244	Kirkenes Airport (Høybuktmoen)	Kirkenes	Norway
KKR	301	Kaukura Airport	Kaukura Atoll	French Polynesia
KKS	191	Kashan Airport	Kashan	Iran
KKW	28	Kikwit Airport	Kikwit	Congo (Kinshasa)
KKX	193	Kikai Airport	Kikai	Japan
KLC	15	Kaolack Airport	Kaolack	Senegal
KLD	243	Migalovo Air Base	Tver	Russia
KLF	243	Grabtsevo Airport	Kaluga	Russia
KLG	52	Kalskag Airport	Kalskag	United States
KLH	150	Kolhapur Airport	Kolhapur	India
KLI	28	Kotakoli Airport	Kotakoli	Congo (Kinshasa)
KLM	191	Kalaleh Airport	Kalaleh	Iran
KLN	52	Larsen Bay Airport	Larsen Bay	United States
KLO	172	Kalibo International Airport	Kalibo	Philippines
KLR	255	Kalmar Airport	Kalkmar	Sweden
KLS	102	Southwest Washington Regional Airport	Kelso	United States
KLU	258	Klagenfurt Airport	Klagenfurt	Austria
KLV	247	Karlovy Vary International Airport	Karlovy Vary	Czech Republic
KLW	52	Klawock Airport	Klawock	United States
KLX	217	Kalamata Airport	Kalamata	Greece
KLZ	23	Kleinsee Airport	Kleinsee	South Africa
KMA	298	Kerema Airport	Kerema	Papua New Guinea
KMC	182	King Khaled Military City Airport	King Khalid Mil.city	Saudi Arabia
KME	27	Kamembe Airport	Kamembe	Rwanda
KMG	186	Kunming Changshui International Airport	Kunming	China
KMH	23	Johan Pienaar Airport	Kuruman	South Africa
KMI	193	Miyazaki Airport	Miyazaki	Japan
KMJ	193	Kumamoto Airport	Kumamoto	Japan
KMN	33	Kamina Base Airport	Kamina Base	Congo (Kinshasa)
KMO	52	Manokotak Airport	Manokotak	United States
KMP	50	Keetmanshoop Airport	Keetmanshoop	Namibia
KMQ	193	Komatsu Airport	Kanazawa	Japan
KMS	1	Kumasi Airport	Kumasi	Ghana
KMU	39	Kisimayu Airport	Kismayu	Somalia
KMV	181	Kalay Airport	Kalemyo	Myanmar
KMW	243	Kostroma Sokerkino Airport	Kostroma	Russia
KNA	121	Viña del mar Airport	Vina del Mar	Chile
KND	33	Kindu Airport	Kindu	Congo (Kinshasa)
KNF	237	RAF Marham	Marham	United Kingdom
KNG	162	Kaimana Airport	Kaimana	Indonesia
KNH	189	Kinmen Airport	Kinmen	Taiwan
KNO	161	Kualanamu International Airport	Medan	Indonesia
KNP	32	Capanda Airport	Kapanda	Angola
KNQ	294	Koné Airport	Kone	New Caledonia
KNS	213	King Island Airport	King Island	Australia
KNU	150	Kanpur Airport	Kanpur	India
KNW	52	New Stuyahok Airport	New Stuyahok	United States
KNX	214	Kununurra Airport	Kununurra	Australia
KOA	285	Ellison Onizuka Kona International At Keahole Airport	Kona	United States
KOC	294	Koumac Airport	Koumac	New Caledonia
KOE	171	El Tari Airport	Kupang	Indonesia
KOI	237	Kirkwall Airport	Kirkwall	United Kingdom
KOJ	193	Kagoshima Airport	Kagoshima	Japan
KOK	229	Kokkola-Pietarsaari Airport	Kruunupyy	Finland
KOP	146	Nakhon Phanom Airport	Nakhon Phanom	Thailand
KOQ	219	Köthen Airport	Koethen	Germany
KOS	177	Sihanoukville International Airport	Sihanoukville	Cambodia
KOT	52	Kotlik Airport	Kotlik	United States
KOU	30	Koulamoutou Mabimbi Airport	Koulamoutou	Gabon
KOV	180	Kokshetau Airport	Kokshetau	Kazakhstan
KOW	186	Ganzhou Airport	Ganzhou	China
KPC	52	Port Clarence Coast Guard Station	Port Clarence	United States
KPN	52	Kipnuk Airport	Kipnuk	United States
KPO	185	Pohang Airport (G-815/K-3)	Pohang	South Korea
KPV	52	Perryville Airport	Perryville	United States
KQA	52	Akutan Seaplane Base	Akutan	United States
KQT	156	Qurghonteppa International Airport	Kurgan Tyube	Tajikistan
KRB	209	Karumba Airport	Karumba	Australia
KRF	255	Kramfors Sollefteå Airport	Kramfors	Sweden
KRH	237	Redhill Aerodrome	Redhill	United Kingdom
KRI	298	Kikori Airport	Kikori	Papua New Guinea
KRK	260	Kraków John Paul II International Airport	Krakow	Poland
KRL	186	Korla Airport	Korla	China
KRN	255	Kiruna Airport	Kiruna	Sweden
KRO	198	Kurgan Airport	Kurgan	Russia
KRP	225	Karup Airport	Karup	Denmark
KRR	243	Krasnodar Pashkovsky International Airport	Krasnodar	Russia
KRS	244	Kristiansand Airport	Kristiansand	Norway
KRT	26	Khartoum International Airport	Khartoum	Sudan
KRW	142	Turkmenbashi Airport	Krasnovodsk	Turkmenistan
KRY	186	Karamay Airport	Karamay	China
KRZ	28	Basango Mboliasa Airport	Kiri	Congo (Kinshasa)
KSA	287	Kosrae International Airport	Kosrae	Micronesia
KSC	220	Košice Airport	Kosice	Slovakia
KSD	255	Karlstad Airport	Karlstad	Sweden
KSF	219	Kassel-Calden Airport	Kassel	Germany
KSH	191	Shahid Ashrafi Esfahani Airport	Bakhtaran	Iran
KSI	14	Kissidougou Airport	Kissidougou	Guinea
KSJ	217	Kasos Airport	Kasos	Greece
KSK	255	Karlskoga Airport	Karlskoga	Sweden
KSL	26	Kassala Airport	Kassala	Sudan
KSM	52	St Mary's Airport	St Mary's	United States
KSN	180	Kostanay West Airport	Kostanay	Kazakhstan
KSO	217	Kastoria National Airport	Kastoria	Greece
KSQ	184	Karshi Khanabad Airport	Khanabad	Uzbekistan
KSS	5	Sikasso Airport	Sikasso	Mali
KSU	244	Kristiansund Airport (Kvernberget)	Kristiansund	Norway
KSY	231	Kars Airport	Kars	Turkey
KSZ	243	Kotlas Airport	Kotlas	Russia
KTA	214	Karratha Airport	Karratha	Australia
KTD	193	Kitadaito Airport	Kitadaito	Japan
KTE	168	Kerteh Airport	Kerteh	Malaysia
KTF	274	Takaka Airport	Takaka	New Zealand
KTG	161	Ketapang(Rahadi Usman) Airport	Ketapang	Indonesia
KTI	177	Kratie Airport	Kratie	Cambodia
KTL	41	Kitale Airport	Kitale	Kenya
KTM	166	Tribhuvan International Airport	Kathmandu	Nepal
KTN	52	Ketchikan International Airport	Ketchikan	United States
KTP	98	Tinson Pen Airport	Kingston	Jamaica
KTQ	229	Kitee Airport	Kitee	Finland
KTR	210	Tindal Airport	Katherine	Australia
KTS	52	Brevig Mission Airport	Brevig Mission	United States
KTT	229	Kittilä Airport	Kittila	Finland
KTU	150	Kota Airport	Kota	India
KTW	260	Katowice International Airport	Katowice	Poland
KUA	168	Kuantan Airport	Kuantan	Malaysia
KUC	302	Kuria Airport	Kuria	Kiribati
KUD	168	Kudat Airport	Kudat	Malaysia
KUF	250	Kurumoch International Airport	Samara	Russia
KUG	209	Kubin Airport	Kubin	Australia
KUH	193	Kushiro Airport	Kushiro	Japan
KUK	52	Kasigluk Airport	Kasigluk	United States
KUL	168	Kuala Lumpur International Airport	Kuala Lumpur	Malaysia
KUM	193	Yakushima Airport	Yakushima	Japan
KUN	259	Kaunas International Airport	Kaunas	Lithuania
KUO	229	Kuopio Airport	Kuopio	Finland
KUT	190	Kopitnari Airport	Kutaisi	Georgia
KUU	150	Kullu Manali Airport	Kulu	India
KUV	185	Kunsan Air Base	Kunsan	South Korea
KVA	217	Alexander the Great International Airport	Kavala	Greece
KVB	255	Skövde Airport	Skovde	Sweden
KVC	52	King Cove Airport	King Cove	United States
KVD	145	Ganja Airport	Ganja	Azerbaijan
KVG	298	Kavieng Airport	Kavieng	Papua New Guinea
KVK	243	Kirovsk-Apatity Airport	Apatity	Russia
KVL	52	Kivalina Airport	Kivalina	United States
KVM	141	Markovo Airport	Markovo	Russia
KVR	196	Kavalerovo Airport	Kavalerovo	Russia
KVX	243	Pobedilovo Airport	Kirov	Russia
KWA	288	Bucholz Army Air Field	Kwajalein	Marshall Islands
KWE	186	Longdongbao Airport	Guiyang	China
KWG	234	Kryvyi Rih International Airport	Krivoy Rog	Ukraine
KWI	169	Kuwait International Airport	Kuwait	Kuwait
KWJ	185	Gwangju Airport	Kwangju	South Korea
KWK	52	Kwigillingok Airport	Kwigillingok	United States
KWL	186	Guilin Liangjiang International Airport	Guilin	China
KWM	209	Kowanyama Airport	Kowanyama	Australia
KWN	52	Quinhagak Airport	Quinhagak	United States
KWT	52	Kwethluk Airport	Kwethluk	United States
KWZ	33	Kolwezi Airport	Kolwezi	Congo (Kinshasa)
KXE	23	P C Pelser Airport	Klerksdorp	South Africa
KXF	279	Koro Island Airport	Koro Island	Fiji
KXK	196	Komsomolsk-on-Amur Airport	Komsomolsk-on-Amur	Russia
KYA	231	Konya Airport	Konya	Turkey
KYD	189	Lanyu Airport	Lanyu	Taiwan
KYE	147	Rene Mouawad Air Base	Kleiat	Lebanon
KYI	208	Yalata Mission Airport	Yalata	Australia
KYK	52	Karluk Airport	Karluk	United States
KYP	181	Kyaukpyu Airport	Kyaukpyu	Burma
KYS	5	Kayes Dag Dag Airport	Kayes	Mali
KYU	52	Koyukuk Airport	Koyukuk	United States
KYZ	167	Kyzyl Airport	Kyzyl	Russia
KZC	177	Kampong Chhnang Airport	Kompong Chnang	Cambodia
KZG	219	Flugplatz Kitzingen	Kitzingen	Germany
KZI	217	Filippos Airport	Kozani	Greece
KZN	243	Kazan International Airport	Kazan	Russia
KZO	180	Kzyl-Orda Southwest Airport	Kzyl-Orda	Kazakhstan
KZR	231	Zafer Airport	Kutahya	Turkey
KZS	217	Kastelorizo Airport	Kastelorizo	Greece
LAA	83	Lamar Municipal Airport	Lamar	United States
LAD	32	Quatro de Fevereiro Airport	Luanda	Angola
LAE	298	Nadzab Airport	Nadzab	Papua New Guinea
LAF	112	Purdue University Airport	Lafayette	United States
LAI	245	Lannion-Côte de Granit Airport	Lannion	France
LAJ	123	Lages Airport	Lajes	Brazil
LAK	85	Aklavik/Freddie Carmichael Airport	Aklavik	Canada
LAL	112	Lakeland Linder International Airport	Lakeland	United States
LAM	83	Los Alamos Airport	Los Alamos	United States
LAN	112	Capital City Airport	Lansing	United States
LAO	172	Laoag International Airport	Laoag	Philippines
LAP	105	Manuel Márquez de León International Airport	La Paz	Mexico
LAQ	48	La Abraq Airport	Al Bayda'	Libya
LAR	83	Laramie Regional Airport	Laramie	United States
LAS	102	McCarran International Airport	Las Vegas	United States
LAU	41	Manda Airstrip	Lamu	Kenya
LAW	77	Lawton Fort Sill Regional Airport	Lawton	United States
LAX	102	Los Angeles International Airport	Los Angeles	United States
LAY	23	Ladysmith Airport	Ladysmith	South Africa
LAZ	87	Bom Jesus da Lapa Airport	Bom Jesus Da Lapa	Brazil
LBA	237	Leeds Bradford Airport	Leeds	United Kingdom
LBB	77	Lubbock Preston Smith International Airport	Lubbock	United States
LBC	219	Lübeck Blankensee Airport	Luebeck	Germany
LBD	156	Khudzhand Airport	Khudzhand	Tajikistan
LBE	112	Arnold Palmer Regional Airport	Latrobe	United States
LBF	77	North Platte Regional Airport Lee Bird Field	North Platte	United States
LBG	245	Paris-Le Bourget Airport	Paris	France
LBI	245	Albi-Le Séquestre Airport	Albi	France
LBJ	171	Komodo Airport	Labuhan Bajo	Indonesia
LBL	77	Liberal Mid-America Regional Airport	Liberal	United States
LBQ	30	Lambarene Airport	Lambarene	Gabon
LBR	68	Lábrea Airport	Labrea	Brazil
LBS	279	Labasa Airport	Lambasa	Fiji
LBT	112	Lumberton Regional Airport	Lumberton	United States
LBU	168	Labuan Airport	Labuan	Malaysia
LBV	30	Libreville Leon M'ba International Airport	Libreville	Gabon
LBW	171	Long Bawan Airport	Long Bawan-Borneo Island	Indonesia
LBX	172	Lubang Airport	Lubang	Philippines
LBY	245	La Baule-Escoublac Airport	La Baule	France
LBZ	32	Lucapa Airport	Lucapa	Angola
LCA	174	Larnaca International Airport	Larnaca	Cyprus
LCC	249	Lecce Galatina Air Base	Lecce	Italy
LCE	130	Goloson International Airport	La Ceiba	Honduras
LCG	239	A Coruña Airport	La Coruna	Spain
LCH	77	Lake Charles Regional Airport	Lake Charles	United States
LCJ	260	Łódź Władysław Reymont Airport	Lodz	Poland
LCK	112	Rickenbacker International Airport	Columbus	United States
LCL	96	La Coloma Airport	La Coloma	Cuba
LCQ	112	Lake City Gateway Airport	Lake City	United States
LCX	186	Longyan Guanzhishan Airport	Longyan	China
LCY	237	London City Airport	London	United Kingdom
LDB	123	Governador José Richa Airport	Londrina	Brazil
LDE	245	Tarbes-Lourdes-Pyrénées Airport	Tarbes	France
LDG	243	Leshukonskoye Airport	Arkhangelsk	Russia
LDH	212	Lord Howe Island Airport	Lord Howe Island	Australia
LDI	16	Lindi Airport	Lindi	Tanzania
LDJ	112	Linden Airport	Linden	United States
LDK	255	Lidköping-Hovby Airport	Lidkoping	Sweden
LDN	166	Lamidanda Airport	Lamidanda	Nepal
LDS	186	Lindu Airport	Yinchun	China
LDU	168	Lahad Datu Airport	Lahad Datu	Malaysia
LDV	245	Landivisiau Air Base	Landivisiau	France
LDX	75	Saint-Laurent-du-Maroni Airport	Saint-Laurent-du-Maroni	French Guiana
LDY	237	City of Derry Airport	Londonderry	United Kingdom
LEA	214	Learmonth Airport	Learmonth	Australia
LEB	112	Lebanon Municipal Airport	Lebanon	United States
LEC	87	Coronel Horácio de Mattos Airport	Lençóis	Brazil
LED	243	Pulkovo Airport	St. Petersburg	Russia
LEH	245	Le Havre Octeville Airport	Le Havre	France
LEI	239	Almería International Airport	Almeria	Spain
LEJ	219	Leipzig/Halle Airport	Leipzig	Germany
LEK	14	Tata Airport	Labe	Guinea
LEL	210	Lake Evella Airport	Lake Evella	Australia
LEN	239	Leon Airport	Leon	Spain
LEQ	237	Land's End Airport	Land's End	United Kingdom
LER	214	Leinster Airport	Leinster	Australia
LET	69	Alfredo Vásquez Cobo International Airport	Leticia	Colombia
LEU	239	Pirineus - la Seu d'Urgel Airport	Seo De Urgel	Spain
LEV	279	Levuka Airfield	Levuka	Fiji
LEW	112	Auburn Lewiston Municipal Airport	Lewiston	United States
LEX	112	Blue Grass Airport	Lexington KY	United States
LEY	216	Lelystad Airport	Lelystad	Netherlands
LFB	36	Lumbo Airport	Lumbo	Mozambique
LFI	112	Langley Air Force Base	Hampton	United States
LFK	77	Angelina County Airport	Lufkin	United States
LFM	191	Lamerd Airport	Lamerd	Iran
LFR	73	La Fria Airport	La Fria	Venezuela
LFT	77	Lafayette Regional Airport	Lafayette	United States
LFW	31	Lomé-Tokoin Airport	Lome	Togo
LGA	112	La Guardia Airport	New York	United States
LGB	102	Long Beach /Daugherty Field/ Airport	Long Beach	United States
LGC	112	LaGrange Callaway Airport	LaGrange	United States
LGG	221	Liège Airport	Liege	Belgium
LGH	208	Leigh Creek Airport	Leigh Creek	Australia
LGI	111	Deadman's Cay Airport	Dead Man's Cay	Bahamas
LGK	168	Langkawi International Airport	Langkawi	Malaysia
LGL	168	Long Lellang Airport	Long Datih	Malaysia
LGO	219	Langeoog Airport	Langeoog	Germany
LGP	172	Legazpi City International Airport	Legazpi	Philippines
LGS	106	Comodoro D.R. Salomón Airport	Malargue	Argentina
LGU	83	Logan-Cache Airport	Logan	United States
LGW	237	London Gatwick Airport	London	United Kingdom
LHA	219	Lahr Airport	Lahr	Germany
LHE	165	Alama Iqbal International Airport	Lahore	Pakistan
LHG	215	Lightning Ridge Airport	Lightning Ridge	Australia
LHR	237	London Heathrow Airport	London	United Kingdom
LHS	56	Las Heras Airport	Las Heras	Argentina
LHV	112	William T. Piper Memorial Airport	Lock Haven	United States
LHW	186	Lanzhou Zhongchuan Airport	Lanzhou	China
LID	216	Valkenburg Naval Air Base	Valkenburg	Netherlands
LIF	294	Lifou Airport	Lifou	New Caledonia
LIG	245	Limoges Airport	Limoges	France
LIH	285	Lihue Airport	Lihue	United States
LII	162	Mulia Airport	Mulia	Indonesia
LIL	245	Lille-Lesquin Airport	Lille	France
LIM	101	Jorge Chávez International Airport	Lima	Peru
LIN	249	Milano Linate Airport	Milan	Italy
LIO	80	Limon International Airport	Limon	Costa Rica
LIP	123	Lins Airport	Lins	Brazil
LIQ	28	Lisala Airport	Lisala	Congo (Kinshasa)
LIR	80	Daniel Oduber Quiros International Airport	Liberia	Costa Rica
LIS	235	Humberto Delgado Airport (Lisbon Portela Airport)	Lisbon	Portugal
LIT	77	Bill & Hillary Clinton National Airport/Adams Field	Little Rock	United States
LIW	181	Loikaw Airport	Loikaw	Burma
LIX	9	Likoma Island Airport	Likoma Island	Malawi
LIY	112	Wright AAF (Fort Stewart)/Midcoast Regional Airport	Wright	United States
LJA	33	Lodja Airport	Lodja	Congo (Kinshasa)
LJG	186	Lijiang Airport	Lijiang	China
LJN	77	Texas Gulf Coast Regional Airport	Angleton	United States
LJU	236	Ljubljana Jože Pučnik Airport	Ljubljana	Slovenia
LKB	279	Lakeba Island Airport	Lakeba Island	Fiji
LKG	41	Lokichoggio Airport	Lokichoggio	Kenya
LKH	168	Long Akah Airport	Long Akah	Malaysia
LKL	244	Banak Airport	Lakselv	Norway
LKN	244	Leknes Airport	Leknes	Norway
LKO	150	Chaudhary Charan Singh International Airport	Lucknow	India
LKP	112	Lake Placid Airport	Lake Placid	United States
LKV	102	Lake County Airport	Lakeview	United States
LKY	16	Lake Manyara Airport	Lake Manyara	Tanzania
LKZ	237	RAF Lakenheath	Lakenheath	United Kingdom
LLA	255	Luleå Airport	Lulea	Sweden
LLE	23	Riverside Airport	Malalane	South Africa
LLF	186	Lingling Airport	Yongzhou	China
LLI	2	Lalibella Airport	Lalibella	Ethiopia
LLK	145	Lankaran International Airport	Lankaran	Azerbaijan
LLU	88	Alluitsup Paa Heliport	Alluitsup Paa	Greenland
LLV	186	Lüliang Airport	Lvliang	China
LLW	9	Lilongwe International Airport	Lilongwe	Malawi
LLY	112	South Jersey Regional Airport	Mount Holly	United States
LMA	52	Minchumina Airport	Lake Minchumina	United States
LME	245	Le Mans-Arnage Airport	Le Mans	France
LMM	105	Valle del Fuerte International Airport	Los Mochis	Mexico
LMN	168	Limbang Airport	Limbang	Malaysia
LMO	237	RAF Lossiemouth	Lossiemouth	United Kingdom
LMP	249	Lampedusa Airport	Lampedusa	Italy
LMQ	48	Marsa Brega Airport	Marsa Brega	Libya
LMT	102	Crater Lake-Klamath Regional Airport	Klamath Falls	United States
LNA	112	Palm Beach County Park Airport	West Palm Beach	United States
LNB	277	Lamen Bay Airport	Lamen Bay	Vanuatu
LND	83	Hunt Field	Lindau	Germany
LNE	277	Lonorore Airport	Lonorore	Vanuatu
LNJ	186	Lintsang Airfield	Lincang	China
LNK	77	Lincoln Airport	Lincoln	United States
LNN	112	Willoughby Lost Nation Municipal Airport	Willoughby	United States
LNO	214	Leonora Airport	Leonora	Australia
LNR	77	Tri-County Regional Airport	Lone Rock	United States
LNS	112	Lancaster Airport	Lancaster	United States
LNY	285	Lanai Airport	Lanai	United States
LNZ	258	Linz Hörsching Airport	Linz	Austria
LOD	277	Longana Airport	Longana	Vanuatu
LOE	146	Loei Airport	Loei	Thailand
LOH	93	Camilo Ponce Enriquez Airport	La Toma (Catamayo)	Ecuador
LOK	41	Lodwar Airport	Lodwar	Kenya
LOO	3	Laghouat Airport	Laghouat	Algeria
LOP	171	Lombok International Airport	Praya	Indonesia
LOS	29	Murtala Muhammed International Airport	Lagos	Nigeria
LOT	77	Lewis University Airport	Lockport	United States
LOU	112	Bowman Field	Louisville	United States
LOV	107	Monclova International Airport	Monclova	Mexico
LOZ	112	London-Corbin Airport/Magee Field	London	United States
LPA	202	Gran Canaria Airport	Gran Canaria	Spain
LPB	100	El Alto International Airport	La Paz	Bolivia
LPC	102	Lompoc Airport	Lompoc	United States
LPD	69	La Pedrera Airport	La Pedrera	Colombia
LPG	70	La Plata Airport	La Plata	Argentina
LPI	255	Linköping City Airport	Linkoeping	Sweden
LPK	243	Lipetsk Airport	Lipetsk	Russia
LPL	237	Liverpool John Lennon Airport	Liverpool	United Kingdom
LPM	277	Lamap Airport	Lamap	Vanuatu
LPP	229	Lappeenranta Airport	Lappeenranta	Finland
LPQ	195	Luang Phabang International Airport	Luang Prabang	Laos
LPS	102	Lopez Island Airport	Lopez	United States
LPT	146	Lampang Airport	Lampang	Thailand
LPU	171	Long Apung Airport	Long Apung-Borneo Island	Indonesia
LPX	248	Liepāja International Airport	Liepaja	Latvia
LPY	245	Le Puy-Loudes Airport	Le Puy	France
LQM	69	Caucaya Airport	Puerto Leguízamo	Colombia
LRA	217	Larisa Airport	Larissa	Greece
LRD	77	Laredo International Airport	Laredo	United States
LRE	209	Longreach Airport	Longreach	Australia
LRF	77	Little Rock Air Force Base	Jacksonville	United States
LRH	245	La Rochelle-Île de Ré Airport	La Rochelle	France
LRL	31	Niamtougou International Airport	Niatougou	Togo
LRM	122	Casa De Campo International Airport	La Romana	Dominican Republic
LRR	191	Lar Airport	Lar	Iran
LRS	217	Leros Airport	Leros	Greece
LRT	245	Lorient South Brittany (Bretagne Sud) Airport	Lorient	France
LRU	83	Las Cruces International Airport	Las Cruces	United States
LRV	73	Los Roques Airport	Los Roques	Venezuela
LSC	121	La Florida Airport	La Serena	Chile
LSE	77	La Crosse Municipal Airport	La Crosse	United States
LSF	112	Lawson Army Air Field (Fort Benning)	Fort Benning	United States
LSH	181	Lashio Airport	Lashio	Burma
LSI	237	Sumburgh Airport	Sumburgh	United Kingdom
LSL	80	Los Chiles Airport	Los Chiles	Costa Rica
LSP	73	Josefa Camejo International Airport	Paraguana	Venezuela
LSQ	121	María Dolores Airport	Los Angeles	Chile
LSS	91	Terre-de-Haut Airport	Les Saintes	Guadeloupe
LST	213	Launceston Airport	Launceston	Australia
LSV	102	Nellis Air Force Base	Las Vegas	United States
LSW	161	Malikus Saleh Airport	Lhok Seumawe-Sumatra Island	Indonesia
LSX	161	Lhok Sukon Airport	Lhok Sukon	Indonesia
LSY	215	Lismore Airport	Lismore	Australia
LSZ	261	Lošinj Island Airport	Mali Losinj	Croatia
LTA	23	Tzaneen Airport	Tzaneen	South Africa
LTD	48	Ghadames East Airport	Ghadames	Libya
LTI	194	Altai Airport	Altai	Mongolia
LTK	152	Bassel Al-Assad International Airport	Latakia	Syria
LTM	94	Lethem Airport	Lethem	Guyana
LTN	237	London Luton Airport	London	United Kingdom
LTO	105	Loreto International Airport	Loreto	Mexico
LTQ	245	Le Touquet-Côte d'Opale Airport	Le Tourquet	France
LTS	77	Altus Air Force Base	Altus	United States
LTT	245	La Môle Airport	La Môle	France
LTX	93	Cotopaxi International Airport	Latacunga	Ecuador
LUA	166	Lukla Airport	Lukla	Nepal
LUD	50	Luderitz Airport	Luderitz	Namibia
LUF	115	Luke Air Force Base	Phoenix	United States
LUG	262	Lugano Airport	Lugano	Switzerland
LUH	150	Ludhiana Airport	Ludhiaha	India
LUK	112	Cincinnati Municipal Airport Lunken Field	Cincinnati	United States
LUM	186	Mangshi Airport	Luxi	China
LUN	34	Kenneth Kaunda International Airport Lusaka	Lusaka	Zambia
LUO	32	Luena Airport	Luena	Angola
LUP	285	Kalaupapa Airport	Molokai	United States
LUQ	59	Brigadier Mayor D Cesar Raul Ojeda Airport	San Luis	Argentina
LUR	52	Cape Lisburne LRRS Airport	Cape Lisburne	United States
LUV	162	Dumatumbun Airport	Langgur-Kei Islands	Indonesia
LUW	171	Syukuran Aminuddin Amir Airport	Luwuk	Indonesia
LUX	238	Luxembourg-Findel International Airport	Luxemburg	Luxembourg
LUZ	260	Lublin Airport	Lublin	Poland
LVA	245	Laval-Entrammes Airport	Laval	France
LVI	34	Livingstone Airport	Livingstone	Zambia
LVK	102	Livermore Municipal Airport	Livermore	United States
LVM	83	Mission Field	Livingston-Montana	United States
LVO	214	Laverton Airport	Laverton	Australia
LVP	191	Lavan Island Airport	Lavan Island	Iran
LVS	83	Las Vegas Municipal Airport	Las Vegas	United States
LWB	112	Greenbrier Valley Airport	Lewisburg	United States
LWC	77	Lawrence Municipal Airport	Lawrence	United States
LWK	237	Lerwick / Tingwall Airport	Lerwick	United Kingdom
LWM	112	Lawrence Municipal Airport	Lawrence	United States
LWN	199	Gyumri Shirak Airport	Gyumri	Armenia
LWO	234	Lviv International Airport	Lvov	Ukraine
LWR	216	Leeuwarden Air Base	Leeuwarden	Netherlands
LWS	102	Lewiston Nez Perce County Airport	Lewiston	United States
LWT	83	Lewistown Municipal Airport	Lewistown	United States
LWY	168	Lawas Airport	Lawas	Malaysia
LXA	186	Lhasa Gonggar Airport	Lhasa	China
LXG	195	Luang Namtha Airport	Luang Namtha	Laos
LXR	12	Luxor International Airport	Luxor	Egypt
LXS	217	Limnos Airport	Limnos	Greece
LYA	186	Luoyang Airport	Luoyang	China
LYB	76	Edward Bodden Airfield	Little Cayman	Cayman Islands
LYC	255	Lycksele Airport	Lycksele	Sweden
LYE	237	RAF Lyneham	Lyneham	United Kingdom
LYG	186	Lianyungang Airport	Lianyungang	China
LYH	112	Lynchburg Regional Preston Glenn Field	Lynchburg	United States
LYI	186	Shubuling Airport	Linyi	China
LYM	237	Lympne Airport	Lympne	United Kingdom
LYN	245	Lyon-Bron Airport	Lyon	France
LYP	165	Faisalabad International Airport	Faisalabad	Pakistan
LYR	138	Svalbard Airport, Longyear	Svalbard	Norway
LYS	245	Lyon Saint-Exupéry Airport	Lyon	France
LYU	77	Ely Municipal Airport	Ely	United States
LYX	237	Lydd Airport	Lydd	United Kingdom
LZC	107	Lázaro Cárdenas Airport	Lazard Cardenas	Mexico
LZH	186	Liuzhou Bailian Airport	Liuzhou	China
LZN	189	Matsu Nangan Airport	Matsu Islands	Taiwan
LZO	186	Luzhou Airport	Luzhou	China
LZR	209	Lizard Island Airport	Lizard Island	Australia
LZU	112	Gwinnett County Briscoe Field	Lawrenceville	United States
LZY	186	Nyingchi Airport	Nyingchi	China
MAA	150	Chennai International Airport	Madras	India
MAB	65	João Correa da Rocha Airport	Maraba	Brazil
MAD	239	Adolfo Suárez Madrid–Barajas Airport	Madrid	Spain
MAE	102	Madera Municipal Airport	Madera	United States
MAF	77	Midland International Airport	Midland	United States
MAG	298	Madang Airport	Madang	Papua New Guinea
MAH	239	Menorca Airport	Menorca	Spain
MAJ	288	Marshall Islands International Airport	Majuro	Marshall Islands
MAK	24	Malakal Airport	Malakal	Sudan
MAM	107	General Servando Canales International Airport	Matamoros	Mexico
MAN	237	Manchester Airport	Manchester	United Kingdom
MAO	68	Eduardo Gomes International Airport	Manaus	Brazil
MAQ	146	Mae Sot Airport	Tak	Thailand
MAR	73	La Chinita International Airport	Maracaibo	Venezuela
MAS	298	Momote Airport	Momote	Papua New Guinea
MAT	28	Tshimpi Airport	Matadi	Congo (Kinshasa)
MAU	301	Maupiti Airport	Maupiti	French Polynesia
MAX	15	Ouro Sogui Airport	Matam	Senegal
MAY	111	Clarence A. Bain Airport	Clarence Bain	Bahamas
MAZ	118	Eugenio Maria De Hostos Airport	Mayaguez	Puerto Rico
MBA	41	Mombasa Moi International Airport	Mombasa	Kenya
MBD	23	Mmabatho International Airport	Mafeking	South Africa
MBE	193	Monbetsu Airport	Monbetsu	Japan
MBH	209	Maryborough Airport	Maryborough	Australia
MBJ	98	Sangster International Airport	Montego Bay	Jamaica
MBL	112	Manistee Co Blacker Airport	Manistee	United States
MBO	172	Mamburao Airport	Mamburao	Philippines
MBS	112	MBS International Airport	Saginaw	United States
MBT	172	Moises R. Espinosa Airport	Masbate	Philippines
MBU	283	Babanakira Airport	Mbambanakira	Solomon Islands
MBW	211	Melbourne Moorabbin Airport	Melbourne	Australia
MBX	236	Maribor Airport	Maribor	Slovenia
MBZ	68	Maués Airport	Maues	Brazil
MCC	102	Mc Clellan Airfield	Sacramento	United States
MCE	102	Merced Regional Macready Field	Merced	United States
MCF	112	Mac Dill Air Force Base	Tampa	United States
MCG	52	McGrath Airport	Mcgrath	United States
MCH	93	General Manuel Serrano Airport	Machala	Ecuador
MCI	77	Kansas City International Airport	Kansas City	United States
MCJ	69	Jorge Isaac Airport	La Mina	Colombia
MCK	77	Mc Cook Ben Nelson Regional Airport	McCook	United States
MCL	52	McKinley National Park Airport	McKinley Park	United States
MCN	112	Middle Georgia Regional Airport	Macon	United States
MCO	112	Orlando International Airport	Orlando	United States
MCP	87	Alberto Alcolumbre Airport	Macapa	Brazil
MCS	79	Monte Caseros Airport	Monte Caseros	Argentina
MCT	173	Muscat International Airport	Muscat	Oman
MCU	245	Montluçon-Guéret Airport	Montlucon-gueret	France
MCV	210	McArthur River Mine Airport	McArthur River Mine	Australia
MCW	77	Mason City Municipal Airport	Mason City	United States
MCX	243	Uytash Airport	Makhachkala	Russia
MCY	209	Sunshine Coast Airport	Maroochydore	Australia
MCZ	87	Zumbi dos Palmares Airport	Maceio	Brazil
MDC	171	Sam Ratulangi Airport	Manado	Indonesia
MDE	69	Jose Maria Córdova International Airport	Rio Negro	Colombia
MDG	186	Mudanjiang Hailang International Airport	Mudanjiang	China
MDI	29	Makurdi Airport	Makurdi	Nigeria
MDK	28	Mbandaka Airport	Mbandaka	Congo (Kinshasa)
MDL	181	Mandalay International Airport	Mandalay	Burma
MDQ	70	Ástor Piazzola International Airport	Mar Del Plata	Argentina
MDS	89	Middle Caicos Airport	Middle Caicos	Turks and Caicos Islands
MDT	112	Harrisburg International Airport	Harrisburg	United States
MDU	298	Mendi Airport	Mendi	Papua New Guinea
MDW	77	Chicago Midway International Airport	Chicago	United States
MDY	290	Henderson Field	Midway	Midway Islands
MDZ	106	El Plumerillo Airport	Mendoza	Argentina
MEA	123	Macaé Airport	Macaé	Brazil
MEB	211	Melbourne Essendon Airport	Melbourne	Australia
MEC	93	Eloy Alfaro International Airport	Manta	Ecuador
MED	182	Prince Mohammad Bin Abdulaziz Airport	Madinah	Saudi Arabia
MEE	294	Maré Airport	Mare	New Caledonia
MEG	32	Malanje Airport	Malanje	Angola
MEH	244	Mehamn Airport	Mehamn	Norway
MEI	77	Key Field	Meridian	United States
MEK	13	Bassatine Airport	Meknes	Morocco
MEL	211	Melbourne International Airport	Melbourne	Australia
MEM	77	Memphis International Airport	Memphis	United States
MEN	245	Mende-Brenoux Airfield	Mende	France
MEO	112	Dare County Regional Airport	Manteo	United States
MER	102	Castle Airport	Merced	United States
MES	161	Soewondo Air Force Base	Medan	Indonesia
MEU	65	Monte Dourado Airport	Almeirim	Brazil
MEX	107	Licenciado Benito Juarez International Airport	Mexico City	Mexico
MEY	166	Meghauli Airport	Meghauli	Nepal
MFA	16	Mafia Island Airport	Mafia Island	Tanzania
MFD	112	Mansfield Lahm Regional Airport	Mansfield	United States
MFE	77	Mc Allen Miller International Airport	Mcallen	United States
MFG	165	Muzaffarabad Airport	Muzaffarabad	Pakistan
MFI	77	Marshfield Municipal Airport	Marshfield	United States
MFJ	279	Moala Airport	Moala	Fiji
MFK	189	Matsu Beigan Airport	Matsu Islands	Taiwan
MFM	170	Macau International Airport	Macau	Macau
MFN	274	Milford Sound Airport	Milford Sound	New Zealand
MFQ	43	Maradi Airport	Maradi	Niger
MFR	102	Rogue Valley International Medford Airport	Medford	United States
MFU	34	Mfuwe Airport	Mfuwe	Zambia
MFX	245	Méribel Altiport	Ajaccio	France
MGA	103	Augusto C. Sandino (Managua) International Airport	Managua	Nicaragua
MGB	208	Mount Gambier Airport	Mount Gambier	Australia
MGC	77	Michigan City Municipal Airport	Michigan City	United States
MGE	112	Dobbins Air Reserve Base	Marietta	United States
MGF	123	Regional de Maringá - Sílvio Nane Junior Airport	Maringa	Brazil
MGH	23	Margate Airport	Margate	South Africa
MGJ	112	Orange County Airport	Montgomery	United States
MGL	219	Mönchengladbach Airport	Moenchengladbach	Germany
MGM	77	Montgomery Regional (Dannelly Field) Airport	MONTGOMERY	United States
MGN	69	Baracoa Airport	Magangue	Colombia
MGQ	39	Aden Adde International Airport	Mogadishu	Somalia
MGS	299	Mangaia Island Airport	Mangaia Island	Cook Islands
MGT	210	Milingimbi Airport	Milingimbi	Australia
MGW	112	Morgantown Municipal Walter L. Bill Hart Field	Morgantown	United States
MGY	112	Dayton-Wright Brothers Airport	Dayton	United States
MGZ	181	Myeik Airport	Myeik	Burma
MHA	94	Mahdia Airport	Mahdia	Guyana
MHC	121	Mocopulli Airport	Castro	Chile
MHD	191	Mashhad International Airport	Mashhad	Iran
MHG	219	Mannheim-City Airport	Mannheim	Germany
MHH	111	Leonard M Thompson International Airport	Marsh Harbor	Bahamas
MHK	77	Manhattan Regional Airport	Manhattan	United States
MHP	242	Minsk 1 Airport	Minsk	Belarus
MHQ	241	Mariehamn Airport	Mariehamn	Finland
MHR	102	Sacramento Mather Airport	Sacramento	United States
MHT	112	Manchester-Boston Regional Airport	Manchester NH	United States
MHU	211	Mount Hotham Airport	Mount Hotham	Australia
MHV	102	Mojave Airport	Mojave	United States
MHX	299	Manihiki Island Airport	Manihiki Island	Cook Islands
MHZ	237	RAF Mildenhall	Mildenhall	United Kingdom
MIA	112	Miami International Airport	Miami	United States
MIB	77	Minot Air Force Base	Minot	United States
MID	107	Licenciado Manuel Crescencio Rejon Int Airport	Merida	Mexico
MIE	112	Delaware County Johnson Field	Muncie	United States
MIG	186	Mianyang Airport	Mianyang	China
MII	123	Frank Miloye Milenkowichi–Marília State Airport	Marília	Brazil
MIJ	288	Mili Island Airport	Mili Island	Marshall Islands
MIK	229	Mikkeli Airport	Mikkeli	Finland
MIM	215	Merimbula Airport	Merimbula	Australia
MIP	163	Ramon Air Base	Ramon	Israel
MIR	49	Monastir Habib Bourguiba International Airport	Monastir	Tunisia
MIS	298	Misima Island Airport	Misima Island	Papua New Guinea
MIU	29	Maiduguri International Airport	Maiduguri	Nigeria
MIV	112	Millville Municipal Airport	Millville	United States
MJA	263	Manja Airport	Manja	Madagascar
MJC	0	Man Airport	Man	Cote d'Ivoire
MJD	165	Moenjodaro Airport	Moenjodaro	Pakistan
MJF	244	Mosjøen Airport (Kjærstad)	Mosjoen	Norway
MJI	48	Mitiga Airport	Tripoli	Libya
MJK	214	Shark Bay Airport	Shark Bay	Australia
MJL	30	Mouilla Ville Airport	Mouila	Gabon
MJM	33	Mbuji Mayi Airport	Mbuji-mayi	Congo (Kinshasa)
MJN	263	Amborovy Airport	Mahajanga	Madagascar
MJT	217	Mytilene International Airport	Mytilini	Greece
MJV	239	San Javier Airport	Murcia	Spain
MJZ	197	Mirny Airport	Mirnyj	Russia
MKC	77	Charles B. Wheeler Downtown Airport	Kansas City	United States
MKE	77	General Mitchell International Airport	Milwaukee	United States
MKG	112	Muskegon County Airport	Muskegon	United States
MKK	285	Molokai Airport	Molokai	United States
MKL	77	McKellar-Sipes Regional Airport	Jackson	United States
MKM	168	Mukah Airport	Mukah	Malaysia
MKP	301	Makemo Airport	Makemo	French Polynesia
MKQ	162	Mopah Airport	Merauke	Indonesia
MKR	214	Meekatharra Airport	Meekatharra	Australia
MKS	2	Mekane Selam Airport	Mekane Selam	Ethiopia
MKU	30	Makokou Airport	Makokou	Gabon
MKW	162	Rendani Airport	Manokwari	Indonesia
MKY	209	Mackay Airport	Mackay	Australia
MKZ	168	Malacca Airport	Malacca	Malaysia
MLA	240	Malta International Airport	Malta	Malta
MLB	112	Melbourne International Airport	Melbourne	United States
MLC	77	Mc Alester Regional Airport	Mcalester	United States
MLE	269	Malé International Airport	Male	Maldives
MLG	161	Abdul Rachman Saleh Airport	Malang	Indonesia
MLI	77	Quad City International Airport	Moline	United States
MLL	52	Marshall Don Hunter Sr Airport	Marshall	United States
MLM	107	General Francisco J. Mujica International Airport	Morelia	Mexico
MLN	239	Melilla Airport	Melilla	Spain
MLO	217	Milos Airport	Milos	Greece
MLS	83	Frank Wiley Field	Miles City	United States
MLU	77	Monroe Regional Airport	Monroe	United States
MLW	40	Spriggs Payne Airport	Monrovia	Liberia
MLX	231	Malatya Erhaç Airport	Malatya	Turkey
MLY	52	Manley Hot Springs Airport	Manley Hot Springs	United States
MMB	193	Memanbetsu Airport	Memanbetsu	Japan
MMD	193	Minami-Daito Airport	Minami Daito	Japan
MME	237	Durham Tees Valley Airport	Teesside	United Kingdom
MMG	214	Mount Magnet Airport	Mount Magnet	Australia
MMH	102	Mammoth Yosemite Airport	Mammoth Lakes	United States
MMI	112	McMinn County Airport	Athens	United States
MMJ	193	Matsumoto Airport	Matsumoto	Japan
MMK	243	Murmansk Airport	Murmansk	Russia
MMO	203	Maio Airport	Maio	Cape Verde
MMU	112	Morristown Municipal Airport	Morristown	United States
MMX	255	Malmö Sturup Airport	Malmoe	Sweden
MMY	193	Miyako Airport	Miyako	Japan
MMZ	164	Maimana Airport	Maimama	Afghanistan
MNB	28	Muanda Airport	Muanda	Congo (Kinshasa)
MNC	36	Nacala Airport	Nacala	Mozambique
MNF	279	Mana Island Airport	Mana Island	Fiji
MNG	210	Maningrida Airport	Maningrida	Australia
MNI	110	John A. Osborne Airport	Geralds	Montserrat
MNJ	263	Mananjary Airport	Mananjary	Madagascar
MNK	302	Maiana Airport	Maiana	Kiribati
MNL	172	Ninoy Aquino International Airport	Manila	Philippines
MNM	77	Menominee Regional Airport	Macon	United States
MNR	34	Mongu Airport	Mongu	Zambia
MNU	181	Mawlamyine Airport	Mawlamyine	Burma
MNX	68	Manicoré Airport	Manicore	Brazil
MNY	283	Mono Airport	Stirling Island	Solomon Islands
MNZ	112	Manassas Regional Airport/Harry P. Davis Field	Manassas	United States
MOA	96	Orestes Acosta Airport	Moa	Cuba
MOB	77	Mobile Regional Airport	Mobile	United States
MOC	123	Mário Ribeiro Airport	Montes Claros	Brazil
MOD	102	Modesto City Co-Harry Sham Field	Modesto	United States
MOE	181	Momeik Airport	Momeik	Burma
MOF	171	Maumere(Wai Oti) Airport	Maumere	Indonesia
MOG	181	Mong Hsat Airport	Mong Hsat	Burma
MOI	299	Mitiaro Island Airport	Mitiaro Island	Cook Islands
MOJ	114	Moengo Airstrip	Moengo	Suriname
MOL	244	Molde Airport	Molde	Norway
MON	274	Mount Cook Airport	Mount Cook	New Zealand
MOO	208	Moomba Airport	Moomba	Australia
MOQ	263	Morondava Airport	Morondava	Madagascar
MOT	77	Minot International Airport	Minot	United States
MOU	52	Mountain Village Airport	Mountain Village	United States
MOV	209	Moranbah Airport	Moranbah	Australia
MOZ	301	Moorea Airport	Moorea	French Polynesia
MPA	50	Katima Mulilo Airport	Mpacha	Namibia
MPH	172	Godofredo P. Ramos Airport	Caticlan	Philippines
MPK	185	Mokpo Heliport	Mokpo	South Korea
MPL	245	Montpellier-Méditerranée Airport	Montpellier	France
MPM	36	Maputo Airport	Maputo	Mozambique
MPN	207	Mount Pleasant Airport	Mount Pleasant	Falkland Islands
MPV	112	Edward F Knapp State Airport	Montpelier	United States
MPW	234	Mariupol International Airport	Mariupol International	Ukraine
MPY	75	Maripasoula Airport	Maripasoula	French Guiana
MQC	108	Miquelon Airport	Miquelon	Saint Pierre and Miquelon
MQF	198	Magnitogorsk International Airport	Magnetiogorsk	Russia
MQH	123	Minaçu Airport	Minacu	Brazil
MQJ	188	Moma Airport	Honuu	Russia
MQL	211	Mildura Airport	Mildura	Australia
MQM	231	Mardin Airport	Mardin	Turkey
MQN	244	Mo i Rana Airport, Røssvoll	Mo i Rana	Norway
MQP	23	Kruger Mpumalanga International Airport	Mpumalanga	South Africa
MQQ	42	Moundou Airport	Moundou	Chad
MQS	129	Mustique Airport	Mustique	Saint Vincent and the Grenadines
MQT	112	Sawyer International Airport	Gwinn	United States
MQU	69	Mariquita Airport	Mariquita	Colombia
MQX	2	Mekele Airport	Makale	Ethiopia
MQY	77	Smyrna Airport	Smyrna	United States
MRB	112	Eastern WV Regional Airport/Shepherd Field	Martinsburg	United States
MRD	73	Alberto Carnevalli Airport	Merida	Venezuela
MRE	41	Mara Serena Lodge Airstrip	Masai Mara	Kenya
MRI	52	Merrill Field	Anchorage	United States
MRK	112	Marco Island Executive Airport	Marco Island Airport	United States
MRN	112	Foothills Regional Airport	Morganton	United States
MRO	274	Hood Airport	Masterton	New Zealand
MRQ	172	Marinduque Airport	Gasan	Philippines
MRR	93	Jose Maria Velasco Ibarra Airport	Macara	Ecuador
MRS	245	Marseille Provence Airport	Marseille	France
MRU	270	Sir Seewoosagur Ramgoolam International Airport	Plaisance	Mauritius
MRV	243	Mineralnyye Vody Airport	Mineralnye Vody	Russia
MRW	225	Lolland Falster Maribo Airport	Maribo	Denmark
MRX	191	Mahshahr Airport	Bandar Mahshahr	Iran
MRY	102	Monterey Peninsula Airport	Monterey	United States
MRZ	215	Moree Airport	Moree	Australia
MSA	136	Muskrat Dam Airport	Muskrat Dam	Canada
MSC	115	Falcon Field	Mesa	United States
MSE	237	Kent International Airport	Manston	United Kingdom
MSH	173	Masirah Air Base	Masirah	Oman
MSJ	193	Misawa Air Base	Misawa	Japan
MSL	77	Northwest Alabama Regional Airport	Muscle Shoals	United States
MSN	77	Dane County Regional Truax Field	Madison	United States
MSO	83	Missoula International Airport	Missoula	United States
MSP	77	Minneapolis-St Paul International/Wold-Chamberlain Airport	Minneapolis	United States
MSQ	242	Minsk National Airport	Minsk 2	Belarus
MSR	231	Muş Airport	Mus	Turkey
MSS	112	Massena International Richards Field	Massena	United States
MST	216	Maastricht Aachen Airport	Maastricht	Netherlands
MSU	37	Moshoeshoe I International Airport	Maseru	Lesotho
MSW	4	Massawa International Airport	Massawa	Eritrea
MSY	77	Louis Armstrong New Orleans International Airport	New Orleans	United States
MSZ	32	Namibe Airport	Mocamedes	Angola
MTC	112	Selfridge Air National Guard Base Airport	Mount Clemens	United States
MTF	2	Mizan Teferi Airport	Mizan Teferi	Ethiopia
MTH	112	The Florida Keys Marathon Airport	Marathon	United States
MTJ	83	Montrose Regional Airport	Montrose CO	United States
MTK	302	Makin Island Airport	Makin	Kiribati
MTL	215	Maitland Airport	Maitland	Australia
MTM	52	Metlakatla Seaplane Base	Metakatla	United States
MTN	112	Martin State Airport	Baltimore	United States
MTR	69	Los Garzones Airport	Monteria	Colombia
MTS	38	Matsapha Airport	Manzini	Swaziland
MTT	107	Minatitlán/Coatzacoalcos National Airport	Minatitlan	Mexico
MTV	277	Mota Lava Airport	Ablow	Vanuatu
MTY	107	General Mariano Escobedo International Airport	Monterrey	Mexico
MTZ	163	Bar Yehuda Airfield	Metzada	Israel
MUA	283	Munda Airport	Munda	Solomon Islands
MUB	21	Maun Airport	Maun	Botswana
MUC	219	Munich Airport	Munich	Germany
MUD	36	Mueda Airport	Mueda	Mozambique
MUE	285	Waimea Kohala Airport	Kamuela	United States
MUH	12	Mersa Matruh Airport	Mersa-matruh	Egypt
MUI	112	Muir Army Air Field (Fort Indiantown Gap) Airport	Muir	United States
MUK	299	Mauke Airport	Mauke Island	Cook Islands
MUN	73	Maturín Airport	Maturin	Venezuela
MUO	83	Mountain Home Air Force Base	Mountain Home	United States
MUR	168	Marudi Airport	Marudi	Malaysia
MUS	193	Minami Torishima Airport	Minami Tori Shima	Japan
MUW	3	Ghriss Airport	Ghriss	Algeria
MUX	165	Multan International Airport	Multan	Pakistan
MUZ	16	Musoma Airport	Musoma	Tanzania
MVA	205	Reykjahlíð Airport	Myvatn	Iceland
MVB	30	M'Vengue El Hadj Omar Bongo Ondimba International Airport	Franceville	Gabon
MVD	109	Carrasco International /General C L Berisso Airport	Montevideo	Uruguay
MVF	87	Dix-Sept Rosado Airport	Mocord	Brazil
MVL	112	Morrisville Stowe State Airport	Morrisville	United States
MVP	69	Fabio Alberto Leon Bentley Airport	Mitu	Colombia
MVQ	242	Mogilev Airport	Mogilev	Belarus
MVR	18	Salak Airport	Maroua	Cameroon
MVS	87	Mucuri Airport	Mucuri	Brazil
MVT	301	Mataiva Airport	Mataiva	French Polynesia
MVV	245	Megève Airport	Verdun	France
MVY	112	Martha's Vineyard Airport	Vineyard Haven MA	United States
MVZ	22	Masvingo International Airport	Masvingo	Zimbabwe
MWA	77	Williamson County Regional Airport	Marion	United States
MWC	77	Lawrence J Timmerman Airport	Milwaukee	United States
MWD	165	Mianwali Air Base	Mianwali	Pakistan
MWF	277	Maewo-Naone Airport	Maewo Island	Vanuatu
MWH	102	Grant County International Airport	Grant County Airport	United States
MWK	161	Tarempa Airport	Anambas Islands	Indonesia
MWL	77	Mineral Wells Airport	Mineral Wells	United States
MWQ	181	Magway Airport	Magwe	Burma
MWX	185	Muan International Airport	Muan	South Korea
MWZ	16	Mwanza Airport	Mwanza	Tanzania
MXB	171	Andi Jemma Airport	Masamba	Indonesia
MXF	77	Maxwell Air Force Base	Montgomery	United States
MXH	298	Moro Airport	Moro	Papua New Guinea
MXJ	29	Minna Airport	Minna	Nigeria
MXL	132	General Rodolfo Sánchez Taboada International Airport	Mexicali	Mexico
MXM	263	Morombe Airport	Morombe	Madagascar
MXN	245	Morlaix-Ploujean Airport	Morlaix	France
MXP	249	Malpensa International Airport	Milano	Italy
MXS	273	Maota Airport	Savaii Island	Samoa
MXT	263	Maintirano Airport	Maintirano	Madagascar
MXV	194	Mörön Airport	Muren	Mongolia
MXX	255	Mora Airport	Mora	Sweden
MXZ	186	Meixian Airport	Meixian	China
MYA	215	Moruya Airport	Moruya	Australia
MYB	30	Mayumba Airport	Mayumba	Gabon
MYC	73	Escuela Mariscal Sucre Airport	Maracay	Venezuela
MYD	41	Malindi Airport	Malindi	Kenya
MYE	193	Miyakejima Airport	Miyakejima	Japan
MYG	111	Mayaguana Airport	Mayaguana	Bahamas
MYI	209	Murray Island Airport	Murray Island	Australia
MYJ	193	Matsuyama Airport	Matsuyama	Japan
MYL	83	McCall Municipal Airport	McCall	United States
MYP	142	Mary Airport	Mary	Turkmenistan
MYQ	150	Mysore Airport	Mysore	India
MYR	112	Myrtle Beach International Airport	Myrtle Beach	United States
MYT	181	Myitkyina Airport	Myitkyina	Burma
MYU	52	Mekoryuk Airport	Mekoryuk	United States
MYV	102	Yuba County Airport	Yuba City	United States
MYW	16	Mtwara Airport	Mtwara	Tanzania
MYY	168	Miri Airport	Miri	Malaysia
MZB	36	Mocímboa da Praia Airport	Mocimboa Da Praia	Mozambique
MZG	189	Makung Airport	Makung	Taiwan
MZH	231	Amasya Merzifon Airport	Merzifon	Turkey
MZI	5	Mopti Airport	Mopti	Mali
MZJ	115	Pinal Airpark	Marana	United States
MZK	302	Marakei Airport	Marakei	Kiribati
MZL	69	La Nubia Airport	Manizales	Colombia
MZM	245	Metz-Frescaty (BA 128) Air Base	Metz	France
MZO	96	Sierra Maestra Airport	Manzanillo	Cuba
MZP	274	Motueka Airport	Motueka	New Zealand
MZQ	23	Mkuze Airport	Mkuze	South Africa
MZR	164	Mazar I Sharif Airport	Mazar-i-sharif	Afghanistan
MZT	105	General Rafael Buelna International Airport	Mazatlan	Mexico
MZU	150	Muzaffarpur Airport	Mazuffarpur	India
MZV	168	Mulu Airport	Mulu	Malaysia
MZW	3	Mecheria Airport	Mecheria	Algeria
NAA	215	Narrabri Airport	Narrabri	Australia
NAG	150	Dr. Babasaheb Ambedkar International Airport	Nagpur	India
NAH	171	Naha Airport	Naha	Indonesia
NAI	94	Annai Airport	Annai	Guyana
NAJ	145	Nakhchivan Airport	Nakhchivan	Azerbaijan
NAK	146	Nakhon Ratchasima Airport	Nakhon Ratchasima	Thailand
NAL	243	Nalchik Airport	Nalchik	Russia
NAN	279	Nadi International Airport	Nandi	Fiji
NAO	186	Nanchong Airport	Nanchong	China
NAP	249	Naples International Airport	Naples	Italy
NAQ	131	Qaanaaq Airport	Qaanaaq	Greenland
NAS	111	Lynden Pindling International Airport	Nassau	Bahamas
NAT	87	Governador Aluízio Alves International Airport	Natal	Brazil
NAV	231	Nevşehir Kapadokya Airport	Nevsehir	Turkey
NAW	146	Narathiwat Airport	Narathiwat	Thailand
NAY	186	Beijing Nanyuan Airport	Beijing	China
NBC	243	Begishevo Airport	Nizhnekamsk	Russia
NBE	49	Enfidha - Hammamet International Airport	Enfidha	Tunisia
NBG	77	New Orleans NAS JRB/Alvin Callender Field	New Orleans	United States
NBO	41	Jomo Kenyatta International Airport	Nairobi	Kenya
NBS	186	Changbaishan Airport	Baishan	China
NBX	162	Nabire Airport	Nabire	Indonesia
NCA	89	North Caicos Airport	North Caicos	Turks and Caicos Islands
NCE	245	Nice-Côte d'Azur Airport	Nice	France
NCG	105	Nuevo Casas Grandes Airport	Nuevo Casas Grandes	Mexico
NCL	237	Newcastle Airport	Newcastle	United Kingdom
NCN	52	Chenega Bay Airport	Chenega	United States
NCO	112	Quonset State Airport	North Kingstown	United States
NCR	103	San Carlos	San Carlos	Nicaragua
NCS	23	Newcastle Airport	Newcastle	South Africa
NCU	184	Nukus Airport	Nukus	Uzbekistan
NCY	245	Annecy-Haute-Savoie-Mont Blanc Airport	Annecy	France
NDB	44	Nouadhibou International Airport	Nouadhibou	Mauritania
NDC	150	Nanded Airport	Nanded	India
NDG	186	Qiqihar Sanjiazi Airport	Qiqihar	China
NDJ	42	N'Djamena International Airport	N'djamena	Chad
NDR	13	Nador International Airport	El Aroui	Morocco
NDU	50	Rundu Airport	Rundu	Namibia
NDY	237	Sanday Airport	Sanday	United Kingdom
NEC	70	Necochea Airport	Necochea	Argentina
NEG	98	Negril Airport	Negril	Jamaica
NEL	112	Lakehurst Maxfield Field Airport	Lakehurst	United States
NER	197	Chulman Airport	Neryungri	Russia
NEU	195	Sam Neua Airport	Sam Neua	Laos
NEV	126	Vance W. Amory International Airport	Charlestown	Saint Kitts and Nevis
NEW	77	Lakefront Airport	New Orleans	United States
NFG	198	Nefteyugansk Airport	Nefteyugansk	Russia
NFL	102	Fallon Naval Air Station	Fallon	United States
NFO	303	Mata'aho Airport	Angaha, Niuafo'ou Island	Tonga
NGB	186	Ningbo Lishe International Airport	Ninbo	China
NGE	18	N'Gaoundéré Airport	N'gaoundere	Cameroon
NGF	285	Kaneohe Bay MCAS (Marion E. Carl Field) Airport	Kaneohe Bay	United States
NGI	279	Ngau Airport	Ngau	Fiji
NGO	193	Chubu Centrair International Airport	Nagoya	Japan
NGQ	186	Ngari Gunsa Airport	Shiquanhe	China
NGS	193	Nagasaki Airport	Nagasaki	Japan
NGU	112	Norfolk Naval Station (Chambers Field)	Norfolk	United States
NGX	166	Manang Airport	Manang	Nepal
NGZ	102	Alameda Naval Air Station	Alameda	United States
NHA	183	Nha Trang Air Base	Nhatrang	Vietnam
NHD	155	Al Minhad Air Base	Minhad AB	United Arab Emirates
NHK	112	Patuxent River Naval Air Station (Trapnell Field)	Patuxent River	United States
NHT	237	RAF Northolt	Northolt	United Kingdom
NHV	289	Nuku Hiva Airport	Nuku Hiva	French Polynesia
NIB	52	Nikolai Airport	Nikolai	United States
NIG	302	Nikunau Airport	Nikunau	Kiribati
NIM	43	Diori Hamani International Airport	Niamey	Niger
NIO	28	Nioki Airport	Nioki	Congo (Kinshasa)
NIP	112	Jacksonville Naval Air Station (Towers Field)	Jacksonville	United States
NIT	245	Niort-Souché Airport	Niort	France
NIU	301	Naiu Airport	Niau	French Polynesia
NJA	193	Atsugi Naval Air Facility	Atsugi	Japan
NJC	198	Nizhnevartovsk Airport	Nizhnevartovsk	Russia
NJF	143	Al Najaf International Airport	Najaf	Iraq
NJK	102	El Centro NAF Airport (Vraciu Field)	El Centro	United States
NKC	44	Nouakchott–Oumtounsy International Airport	Nouakschott	Mauritania
NKG	186	Nanjing Lukou Airport	Nanjing	China
NKM	193	Nagoya Airport	Nagoya	Japan
NKT	231	Şırnak Şerafettin Elçi Airport	Cizre	Turkey
NKW	264	Diego Garcia Naval Support Facility	Diego Garcia Island	British Indian Ocean Territory
NKX	102	Miramar Marine Corps Air Station - Mitscher Field	Miramar	United States
NLA	34	Simon Mwansa Kapwepwe International Airport	Ndola	Zambia
NLC	102	Lemoore Naval Air Station (Reeves Field) Airport	Lemoore	United States
NLD	107	Quetzalcóatl International Airport	Nuevo Laredo	Mexico
NLF	209	Darnley Island Airport	Darnley Island	Australia
NLG	52	Nelson Lagoon Airport	Nelson Lagoon	United States
NLK	293	Norfolk Island International Airport	Norfolk Island	Norfolk Island
NLO	28	Ndolo Airport	Kinshasa	Congo (Kinshasa)
NLP	23	Nelspruit Airport	Nelspruit	South Africa
NLT	186	Xinyuan Nalati Airport	Xinyuan	China
NLV	234	Mykolaiv International Airport	Nikolayev	Ukraine
NMA	184	Namangan Airport	Namangan	Uzbekistan
NMB	150	Daman Airport	Daman	India
NMC	111	Normans Cay Airport	Norman's Cay	Bahamas
NME	52	Nightmute Airport	Nightmute	United States
NMS	181	Namsang Airport	Namsang	Burma
NMT	181	Namtu Airport	Naypyidaw	Burma
NNA	13	Kenitra Airport	Kentira	Morocco
NNB	283	Santa Ana Airport	Santa Ana	Solomon Islands
NNG	186	Nanning Wuxu Airport	Nanning	China
NNL	52	Nondalton Airport	Nondalton	United States
NNM	243	Naryan Mar Airport	Naryan-Mar	Russia
NNR	226	Connemara Regional Airport	Indreabhan	Ireland
NNT	146	Nan Airport	Nan	Thailand
NNX	171	Nunukan Airport	Nunukan-Nunukan Island	Indonesia
NNY	186	Nanyang Jiangying Airport	Nanyang	China
NOA	215	Nowra Airport	Nowra	Australia
NOB	80	Nosara Airport	Nosara Beach	Costa Rica
NOC	226	Ireland West Knock Airport	Connaught	Ireland
NOD	219	Norden-Norddeich Airport	Norden	Germany
NOG	97	Nogales International Airport	Nogales	Mexico
NOJ	198	Noyabrsk Airport	Noyabrsk	Russia
NON	302	Nonouti Airport	Nonouti	Kiribati
NOP	231	Sinop Airport	Sinop	Turkey
NOR	205	Norðfjörður Airport	Nordfjordur	Iceland
NOS	263	Fascene Airport	Nosy-be	Madagascar
NOT	102	Marin County Airport - Gnoss Field	Novato	United States
NOU	294	La Tontouta International Airport	Noumea	New Caledonia
NOV	32	Nova Lisboa Airport	Huambo	Angola
NOZ	167	Spichenkovo Airport	Novokuznetsk	Russia
NPA	77	Pensacola Naval Air Station/Forrest Sherman Field	Pensacola	United States
NPE	274	Hawke's Bay Airport	NAPIER	New Zealand
NPL	274	New Plymouth Airport	New Plymouth	New Zealand
NPO	161	Nanga Pinoh Airport	Nangapinoh	Indonesia
NQA	77	Millington-Memphis Airport	Millington	United States
NQI	77	Kingsville Naval Air Station	Kingsville	United States
NQN	57	Presidente Peron Airport	Neuquen	Argentina
NQT	237	Nottingham Airport	Nottingham	United Kingdom
NQU	69	Reyes Murillo Airport	Nuquí	Colombia
NQX	112	Naval Air Station Key West/Boca Chica Field	Key West	United States
NQY	237	Newquay Cornwall Airport	Newquai	United Kingdom
NRA	215	Narrandera Airport	Narrandera	Australia
NRD	219	Norderney Airport	Norderney	Germany
NRK	255	Norrköping Airport	Norrkoeping	Sweden
NRL	237	North Ronaldsay Airport	North Ronaldsay	United Kingdom
NRN	219	Weeze Airport	Weeze	Germany
NRR	118	José Aponte de la Torre Airport	Ceiba	Puerto Rico
NRT	193	Narita International Airport	Tokyo	Japan
NSE	77	Whiting Field Naval Air Station - North	Milton	United States
NSH	191	Noshahr Airport	Noshahr	Iran
NSI	18	Yaoundé Nsimalen International Airport	Yaounde	Cameroon
NSK	167	Norilsk-Alykel Airport	Norilsk	Russia
NSN	274	Nelson Airport	Nelson	New Zealand
NSO	215	Scone Airport	Scone	Australia
NST	146	Nakhon Si Thammarat Airport	Nakhon Si Thammarat	Thailand
NSY	249	Sigonella Navy Air Base	Sigonella	Italy
NTB	244	Notodden Airport	Notodden	Norway
NTD	102	Point Mugu Naval Air Station (Naval Base Ventura Co)	Point Mugu	United States
NTE	245	Nantes Atlantique Airport	Nantes	France
NTI	162	Stenkol Airport	Bintuni	Indonesia
NTL	215	Newcastle Airport	Newcastle	Australia
NTN	209	Normanton Airport	Normanton	Australia
NTQ	193	Noto Airport	Wajima	Japan
NTR	107	Del Norte International Airport	Monterrey	Mexico
NTT	303	Kuini Lavenia Airport	Niuatoputapu	Tonga
NTU	112	Oceana Naval Air Station	Oceana	United States
NTX	161	Ranai Airport	Ranai-Natuna Besar Island	Indonesia
NTY	23	Pilanesberg International Airport	Pilanesberg	South Africa
NUE	219	Nuremberg Airport	Nuernberg	Germany
NUI	52	Nuiqsut Airport	Nuiqsut	United States
NUL	52	Nulato Airport	Nulato	United States
NUQ	102	Moffett Federal Airfield	Mountain View	United States
NUS	277	Norsup Airport	Norsup	Vanuatu
NUW	102	Whidbey Island Naval Air Station (Ault Field)	Whidbey Island	United States
NUX	198	Novy Urengoy Airport	Novy Urengoy	Russia
NVA	69	Benito Salas Airport	Neiva	Colombia
NVI	184	Navoi Airport	Navoi	Uzbekistan
NVK	244	Narvik Framnes Airport	Narvik	Norway
NVP	68	Novo Aripuanã Airport	Novo Aripuana	Brazil
NVS	245	Nevers-Fourchambault Airport	Nevers	France
NVT	123	Ministro Victor Konder International Airport	Navegantes	Brazil
NWA	267	Mohéli Bandar Es Eslam Airport	Moheli	Comoros
NWI	237	Norwich International Airport	Norwich	United Kingdom
NXX	112	Willow Grove Naval Air Station/Joint Reserve Base	Willow Grove	United States
NYA	198	Nyagan Airport	Nyagan	Russia
NYE	41	Nyeri Airport	NYERI	Kenya
NYI	1	Sunyani Airport	Sunyani	Ghana
NYK	41	Nanyuki Airport	Nanyuki	Kenya
NYM	198	Nadym Airport	Nadym	Russia
NYO	255	Stockholm Skavsta Airport	Stockholm	Sweden
NYT	181	Naypyidaw Airport	Naypyidaw	Burma
NYU	181	Bagan Airport	Bagan	Burma
NYW	181	Monywar Airport	Monywa	Burma
NZA	32	Nzagi Airport	Nzagi	Angola
NZC	101	Maria Reiche Neuman Airport	Nazca	Peru
NZH	186	Manzhouli Xijiao Airport	Manzhouli	China
NZJ	102	El Toro Marine Corps Air Station	Santa Ana	United States
NZY	102	North Island Naval Air Station-Halsey Field	San Diego	United States
OAA	164	Shank Air Base	Shank	Afghanistan
OAG	215	Orange Airport	Orange	Australia
OAH	164	Shindand Airport	Shindand	Afghanistan
OAI	164	Bagram Air Base	Kabul	Afghanistan
OAJ	112	Albert J Ellis Airport	Jacksonville NC	United States
OAK	102	Metropolitan Oakland International Airport	Oakland	United States
OAL	68	Cacoal Airport	Cacoal	Brazil
OAM	274	Oamaru Airport	Oamaru	New Zealand
OAR	102	Marina Municipal Airport	Fort Ord	United States
OAS	164	Sharana Airstrip	Sharona	Afghanistan
OAX	107	Xoxocotlán International Airport	Oaxaca	Mexico
OAZ	164	Camp Bastion Airport	Camp Bastion	Afghanistan
OBC	17	Obock Airport	Obock	Djibouti
OBE	112	Okeechobee County Airport	Okeechobee	United States
OBF	219	Oberpfaffenhofen Airport	Oberpfaffenhofen	Germany
OBL	221	Zoersel (Oostmalle) Airfield	Zoersel	Belgium
OBN	237	Oban Airport	North Connel	United Kingdom
OBO	193	Tokachi-Obihiro Airport	Obihiro	Japan
OBS	245	Aubenas-Ardèche Méridional Airport	Aubenas-vals-lanas	France
OBU	52	Kobuk Airport	Kobuk	United States
OBY	124	Ittoqqortoormiit Heliport	Ittoqqortoormiit	Greenland
OCA	112	Ocean Reef Club Airport	Ocean Reef Club Airport	United States
OCC	93	Francisco De Orellana Airport	Coca	Ecuador
OCF	112	Ocala International Airport - Jim Taylor Field	Ocala	United States
OCJ	98	Boscobel Aerodrome	Ocho Rios	Jamaica
OCN	102	Oceanside Municipal Airport	Fraser Island	Australia
OCV	69	Aguas Claras Airport	Ocana	Colombia
OCW	112	Warren Field	Washington	United States
ODB	239	Córdoba Airport	Cordoba	Spain
ODE	225	Odense Airport	Odense	Denmark
ODH	237	RAF Odiham	Odiham	United Kingdom
ODN	168	Long Seridan Airport	Long Seridan	Malaysia
ODO	160	Bodaybo Airport	Bodaibo	Russia
ODS	234	Odessa International Airport	Odessa	Ukraine
ODY	195	Oudomsay Airport	Muang Xay	Laos
OEM	114	Vincent Fayks Airport	Paloemeu	Suriname
OER	255	Örnsköldsvik Airport	Ornskoldsvik	Sweden
OES	57	Antoine de Saint Exupéry Airport	San Antonio Oeste	Argentina
OFF	77	Offutt Air Force Base	Omaha	United States
OGD	83	Ogden Hinckley Airport	Ogden	United States
OGG	285	Kahului Airport	Kahului	United States
OGL	94	Eugene F. Correira International Airport	Georgetown	Guyana
OGN	193	Yonaguni Airport	Yonaguni Jima	Japan
OGS	112	Ogdensburg International Airport	Ogdensburg	United States
OGX	3	Ain el Beida Airport	Ouargla	Algeria
OGZ	243	Beslan Airport	Beslan	Russia
OHA	274	RNZAF Base Ohakea	Ohakea	New Zealand
OHD	253	Ohrid St. Paul the Apostle Airport	Ohrid	Macedonia
OHE	186	Gu-Lian Airport	Mohe County	China
OHO	196	Okhotsk Airport	Okhotsk	Russia
OIA	65	Ourilândia do Norte Airport	Ourilandia do Norte	Brazil
OIM	193	Oshima Airport	Oshima	Japan
OIR	193	Okushiri Airport	Okushiri	Japan
OIT	193	Oita Airport	Oita	Japan
OJC	77	Johnson County Executive Airport	Olathe	United States
OKA	193	Naha Airport	Okinawa	Japan
OKC	77	Will Rogers World Airport	Oklahoma City	United States
OKD	193	Okadama Airport	Sapporo	Japan
OKE	193	Okierabu Airport	Okierabu	Japan
OKF	50	Okaukuejo Airport	Okaukuejo	Namibia
OKI	193	Oki Airport	Oki Island	Japan
OKJ	193	Okayama Airport	Okayama	Japan
OKM	77	Okmulgee Regional Airport	Okmulgee	United States
OKN	30	Okondja Airport	Okondja	Gabon
OKO	193	Yokota Air Base	Yokota	Japan
OKR	209	Yorke Island Airport	Yorke Island	Australia
OKU	50	Mokuti Lodge Airport	Mokuti Lodge	Namibia
OKY	209	Oakey Airport	Oakey	Australia
OLA	244	Ørland Airport	Orland	Norway
OLB	249	Olbia Costa Smeralda Airport	Olbia	Italy
OLC	68	Senadora Eunice Micheles Airport	Sao Paulo de Olivenca	Brazil
OLF	83	L M Clayton Airport	Wolf Point	United States
OLJ	277	North West Santo Airport	Olpoi	Vanuatu
OLM	102	Olympia Regional Airport	Olympia	United States
OLP	208	Olympic Dam Airport	Olympic Dam	Australia
OLS	115	Nogales International Airport	Nogales	United States
OLV	77	Olive Branch Airport	Olive Branch	United States
OLZ	197	Olyokminsk Airport	Olekminsk	Russia
OMA	77	Eppley Airfield	Omaha	United States
OMB	30	Omboue Hopital Airport	Omboue Hospial	Gabon
OMC	172	Ormoc Airport	Ormoc City	Philippines
OMD	50	Oranjemund Airport	Oranjemund	Namibia
OME	52	Nome Airport	Nome	United States
OMF	140	King Hussein Air College	Mafraq	Jordan
OMH	191	Urmia Airport	Uromiyeh	Iran
OMI	191	Omidiyeh Airport	Omidyeh	Iran
OMO	251	Mostar International Airport	Mostar	Bosnia and Herzegovina
OMR	222	Oradea International Airport	Oradea	Romania
OMS	175	Omsk Central Airport	Omsk	Russia
OND	50	Ondangwa Airport	Ondangwa	Namibia
ONG	209	Mornington Island Airport	Mornington Island	Australia
ONJ	193	Odate Noshiro Airport	Odate Noshiro	Japan
ONK	197	Olenyok Airport	Olenyok	Russia
ONO	83	Ontario Municipal Airport	Ontario	United States
ONP	102	Newport Municipal Airport	Newport	United States
ONQ	231	Zonguldak Airport	Zonguldak	Turkey
ONS	214	Onslow Airport	Onslow	Australia
ONT	102	Ontario International Airport	Ontario	United States
ONX	113	Enrique Adolfo Jimenez Airport	Colón	Panama
OOK	52	Toksook Bay Airport	Toksook Bay	United States
OOL	209	Gold Coast Airport	Coolangatta	Australia
OOM	215	Cooma Snowy Mountains Airport	Cooma	Australia
OPF	112	Opa-locka Executive Airport	Miami	United States
OPO	235	Francisco de Sá Carneiro Airport	Porto	Portugal
OPS	71	Presidente João Batista Figueiredo Airport	Sinop	Brazil
OPU	298	Balimo Airport	Balimo	Papua New Guinea
ORA	57	Orán Airport	Oran	Argentina
ORB	255	Örebro Airport	Orebro	Sweden
ORD	77	Chicago O'Hare International Airport	Chicago	United States
ORE	245	Orléans-Bricy (BA 123) Air Base	Orleans	France
ORF	112	Norfolk International Airport	Norfolk	United States
ORG	114	Zorg en Hoop Airport	Paramaribo	Suriname
ORH	112	Worcester Regional Airport	Worcester	United States
ORJ	94	Orinduik Airport	Orinduik	Guyana
ORK	226	Cork Airport	Cork	Ireland
ORL	112	Orlando Executive Airport	Orlando	United States
ORN	3	Es Senia Airport	Oran	Algeria
ORP	21	Orapa Airport	Orapa	Botswana
ORT	52	Northway Airport	Northway	United States
ORU	100	Juan Mendoza Airport	Oruro	Bolivia
ORV	52	Robert (Bob) Curtis Memorial Airport	Noorvik	United States
ORW	165	Ormara Airport	Ormara Raik	Pakistan
ORX	65	Oriximiná Airport	Oriximina	Brazil
ORY	245	Paris-Orly Airport	Paris	France
OSC	112	Oscoda Wurtsmith Airport	Oscoda	United States
OSD	255	Åre Östersund Airport	Östersund	Sweden
OSF	243	Ostafyevo International Airport	Moscow	Russia
OSH	77	Wittman Regional Airport	Oshkosh	United States
OSI	261	Osijek Airport	Osijek	Croatia
OSK	255	Oskarshamn Airport	Oskarshamn	Sweden
OSL	244	Oslo Lufthavn	Oslo	Norway
OSM	143	Mosul International Airport	Mosul	Iraq
OSN	185	Osan Air Base	Osan	South Korea
OSP	260	Redzikowo Air Base	Slupsk	Poland
OSR	247	Ostrava Leos Janáček Airport	Ostrava	Czech Republic
OSS	148	Osh Airport	Osh	Kyrgyzstan
OST	221	Ostend-Bruges International Airport	Ostend	Belgium
OSU	112	The Ohio State University Airport - Don Scott Field	Columbus	United States
OSW	198	Orsk Airport	Orsk	Russia
OSY	244	Namsos Høknesøra Airport	Namsos	Norway
OTH	102	Southwest Oregon Regional Airport	North Bend	United States
OTI	162	Pitu Airport	Morotai Island	Indonesia
OTK	102	Tillamook Airport	Tillamook	United States
OTP	222	Henri Coandă International Airport	Bucharest	Romania
OTR	80	Coto 47 Airport	Coto 47	Costa Rica
OTU	69	Otu Airport	Otu	Colombia
OTZ	52	Ralph Wien Memorial Airport	Kotzebue	United States
OUA	45	Ouagadougou Airport	Ouagadougou	Burkina Faso
OUD	13	Angads Airport	Oujda	Morocco
OUE	10	Ouesso Airport	Ouesso	Congo (Kinshasa)
OUH	23	Oudtshoorn Airport	Oudtshoorn	South Africa
OUK	237	Outer Skerries Airport	Outer Skerries	United Kingdom
OUL	229	Oulu Airport	Oulu	Finland
OUZ	44	Tazadit Airport	Zouerat	Mauritania
OVA	263	Bekily Airport	Bekily	Madagascar
OVB	167	Tolmachevo Airport	Novosibirsk	Russia
OVD	239	Asturias Airport	Aviles	Spain
OVG	23	Overberg Airport	Overberg	South Africa
OVR	70	Olavarria Airport	Olavarria	Argentina
OVS	198	Sovetskiy Airport	Sovetskiy	Russia
OWB	77	Owensboro Daviess County Airport	Owensboro	United States
OWD	112	Norwood Memorial Airport	Norwood	United States
OXB	8	Osvaldo Vieira International Airport	Bissau	Guinea-Bissau
OXC	112	Waterbury Oxford Airport	Oxford	United States
OXF	237	Oxford (Kidlington) Airport	Oxford	United Kingdom
OXR	102	Oxnard Airport	Oxnard	United States
OYA	79	Goya Airport	Goya	Argentina
OYE	30	Oyem Airport	Oyem	Gabon
OYK	87	Oiapoque Airport	Oioiapoque	Brazil
OYL	41	Moyale Airport	Moyale	Kenya
OYO	70	Tres Arroyos Airport	Tres Arroyos	Argentina
OYP	75	Saint-Georges-de-l'Oyapock Airport	St.-georges Oyapock	French Guiana
OZA	77	Ozona Municipal Airport	Ozona	United States
OZC	172	Labo Airport	Ozamis	Philippines
OZG	13	Zagora Airport	Zagora	Morocco
OZH	234	Zaporizhzhia International Airport	Zaporozhye	Ukraine
OZP	239	Moron Air Base	Sevilla	Spain
OZZ	13	Ouarzazate Airport	Ouarzazate	Morocco
PAA	181	Hpa-N Airport	Hpa-an	Burma
PAB	150	Bilaspur Airport	Bilaspur	India
PAC	113	Marcos A. Gelabert International Airport	Panama	Panama
PAD	219	Paderborn Lippstadt Airport	Paderborn	Germany
PAE	102	Snohomish County (Paine Field) Airport	Everett	United States
PAG	172	Pagadian Airport	Pagadian	Philippines
PAH	77	Barkley Regional Airport	PADUCAH	United States
PAJ	165	Parachinar Airport	Parachinar	Pakistan
PAM	77	Tyndall Air Force Base	Panama City	United States
PAN	146	Pattani Airport	Pattani	Thailand
PAO	102	Palo Alto Airport of Santa Clara County	Palo Alto	United States
PAP	116	Toussaint Louverture International Airport	Port-au-prince	Haiti
PAQ	52	Warren "Bud" Woods Palmer Municipal Airport	Palmer	United States
PAS	217	Paros National Airport	Paros	Greece
PAT	150	Lok Nayak Jayaprakash Airport	Patina	India
PAV	87	Paulo Afonso Airport	Paulo Alfonso	Brazil
PAX	116	Port-de-Paix Airport	Port-de-Paix	Haiti
PAZ	107	El Tajín National Airport	Poza Rico	Mexico
PBC	107	Hermanos Serdán International Airport	Puebla	Mexico
PBD	150	Porbandar Airport	Porbandar	India
PBF	77	Pine Bluff Regional Airport, Grider Field	Pine Bluff	United States
PBG	112	Plattsburgh International Airport	Plattsburgh	United States
PBH	192	Paro Airport	Thimphu	Bhutan
PBI	112	Palm Beach International Airport	West Palm Beach	United States
PBJ	277	Tavie Airport	Paama Island	Vanuatu
PBL	73	General Bartolome Salom International Airport	Puerto Cabello	Venezuela
PBM	114	Johan Adolf Pengel International Airport	Zandery	Suriname
PBN	32	Porto Amboim Airport	Porto Amboim	Angola
PBO	214	Paraburdoo Airport	Paraburdoo	Australia
PBP	80	Islita Airport	Nandayure	Costa Rica
PBR	92	Puerto Barrios Airport	Puerto Barrios	Guatemala
PBU	181	Putao Airport	Putao	Burma
PBZ	23	Plettenberg Bay Airport	Plettenberg Bay	South Africa
PCB	161	Pondok Cabe Air Base	Jakarta	Indonesia
PCF	23	Potchefstroom Airport	Potchefstroom	South Africa
PCL	101	Cap FAP David Abenzur Rengifo International Airport	Pucallpa	Peru
PCN	274	Picton Aerodrome	Picton	New Zealand
PCP	47	Principe Airport	Principe	Sao Tome and Principe
PCR	69	German Olano Airport	Puerto Carreno	Colombia
PDA	69	Obando Airport	Puerto Inírida	Colombia
PDG	161	Minangkabau International Airport	Padang	Indonesia
PDK	112	DeKalb Peachtree Airport	Atlanta	United States
PDL	200	João Paulo II Airport	Ponta Delgada	Portugal
PDO	161	Pendopo Airport	Talang Gudang-Sumatra Island	Indonesia
PDP	109	Capitan Corbeta CA Curbelo International Airport	Punta del Este	Uruguay
PDS	107	Piedras Negras International Airport	Piedras Negras	Mexico
PDT	102	Eastern Oregon Regional At Pendleton Airport	Pendleton	United States
PDV	254	Plovdiv International Airport	Plovdiv	Bulgaria
PDX	102	Portland International Airport	Portland	United States
PEA	208	Penneshaw Airport	Penneshaw	Australia
PED	247	Pardubice Airport	Pardubice	Czech Republic
PEE	198	Bolshoye Savino Airport	Perm	Russia
PEF	219	Peenemünde Airport	Peenemunde	Germany
PEG	249	Perugia San Francesco d'Assisi – Umbria International Airport	Perugia	Italy
PEH	70	Comodoro Pedro Zanni Airport	Pehuajo	Argentina
PEI	69	Matecaña International Airport	Pereira	Colombia
PEK	186	Beijing Capital International Airport	Beijing	China
PEM	101	Padre Aldamiz International Airport	Puerto Maldonado	Peru
PEN	168	Penang International Airport	Penang	Malaysia
PEQ	77	Pecos Municipal Airport	Pecos	United States
PER	214	Perth International Airport	Perth	Australia
PES	243	Petrozavodsk Airport	Petrozavodsk	Russia
PET	123	João Simões Lopes Neto International Airport	Pelotas	Brazil
PEU	130	Puerto Lempira Airport	Puerto Lempira	Honduras
PEV	223	Pécs-Pogány Airport	Pécs-Pogány	Hungary
PEW	165	Peshawar International Airport	Peshawar	Pakistan
PEX	243	Pechora Airport	Pechora	Russia
PEZ	243	Penza Airport	Penza	Russia
PFB	123	Lauro Kurtz Airport	Passo Fundo	Brazil
PFJ	205	Patreksfjörður Airport	Patreksfjordur	Iceland
PFN	77	Panama City-Bay Co International Airport	Panama City	United States
PFO	174	Paphos International Airport	Paphos	Cyprus
PFQ	191	Parsabade Moghan Airport	Parsabad	Iran
PFR	33	Ilebo Airport	Ilebo	Congo (Kinshasa)
PGA	115	Page Municipal Airport	Page	United States
PGD	112	Charlotte County Airport	Punta Gorda	United States
PGF	245	Perpignan-Rivesaltes (Llabanère) Airport	Perpignan	France
PGH	150	Pantnagar Airport	Nainital	India
PGK	161	Pangkal Pinang (Depati Amir) Airport	Pangkal Pinang	Indonesia
PGU	191	Persian Gulf International Airport	Khalije Fars	Iran
PGV	112	Pitt Greenville Airport	Greenville	United States
PGX	245	Périgueux-Bassillac Airport	Perigueux	France
PHA	183	Phan Rang Airport	Phan Rang	Vietnam
PHB	87	Prefeito Doutor João Silva Filho Airport	Parnaiba	Brazil
PHC	29	Port Harcourt International Airport	Port Hartcourt	Nigeria
PHD	112	Harry Clever Field	New Philadelpha	United States
PHE	214	Port Hedland International Airport	Port Hedland	Australia
PHF	112	Newport News Williamsburg International Airport	Newport News	United States
PHK	112	Palm Beach County Glades Airport	Pahokee	United States
PHL	112	Philadelphia International Airport	Philadelphia	United States
PHN	112	St Clair County International Airport	Port Huron	United States
PHS	146	Phitsanulok Airport	Phitsanulok	Thailand
PHW	23	Hendrik Van Eck Airport	Phalaborwa	South Africa
PHX	115	Phoenix Sky Harbor International Airport	Phoenix	United States
PHY	146	Phetchabun Airport	Phetchabun	Thailand
PIA	77	General Wayne A. Downing Peoria International Airport	Peoria	United States
PIB	77	Hattiesburg Laurel Regional Airport	Hattiesburg/Laurel	United States
PID	111	Nassau Paradise Island Airport	Nassau	Bahamas
PIE	112	St Petersburg Clearwater International Airport	St. Petersburg	United States
PIF	189	Pingtung North Airport	Pingtung	Taiwan
PIH	83	Pocatello Regional Airport	Pocatello	United States
PIK	237	Glasgow Prestwick Airport	Prestwick	United Kingdom
PIL	63	Carlos Miguel Gimenez Airport	Pilar	Paraguay
PIM	112	Harris County Airport	Pine Mountain	United States
PIN	68	Parintins Airport	Parintins	Brazil
PIO	101	Capitán FAP Renán Elías Olivera International Airport	Pisco	Peru
PIP	52	Pilot Point Airport	Pilot Point	United States
PIR	77	Pierre Regional Airport	Pierre	United States
PIS	245	Poitiers-Biard Airport	Poitiers	France
PIT	112	Pittsburgh International Airport	Pittsburgh	United States
PIU	101	Capitán FAP Guillermo Concha Iberico International Airport	Piura	Peru
PIX	200	Pico Airport	Pico	Portugal
PIZ	52	Point Lay LRRS Airport	Point Lay	United States
PJA	255	Pajala Airport	Pajala	Sweden
PJC	63	Dr Augusto Roberto Fuster International Airport	Pedro Juan Caballero	Paraguay
PJG	165	Panjgur Airport	Panjgur	Pakistan
PJM	80	Puerto Jimenez Airport	Puerto Jimenez	Costa Rica
PKA	52	Napaskiak Airport	Napaskiak	United States
PKB	112	Mid Ohio Valley Regional Airport	PARKERSBURG	United States
PKC	141	Yelizovo Airport	Petropavlovsk	Russia
PKE	215	Parkes Airport	Parkes	Australia
PKG	168	Pulau Pangkor Airport	Pangkor Island	Malaysia
PKH	217	Porto Cheli Airport	Porto Heli	Greece
PKK	181	Pakhokku Airport	Pakhokku	Burma
PKN	161	Iskandar Airport	Pangkalan Bun	Indonesia
PKP	301	Puka Puka Airport	Puka Puka	French Polynesia
PKR	166	Pokhara Airport	Pokhara	Nepal
PKU	161	Sultan Syarif Kasim Ii (Simpang Tiga) Airport	Pekanbaru	Indonesia
PKV	243	Pskov Airport	Pskov	Russia
PKW	21	Selebi Phikwe Airport	Selebi-phikwe	Botswana
PKY	161	Tjilik Riwut Airport	Palangkaraya	Indonesia
PKZ	195	Pakse International Airport	Pakse	Laos
PLD	80	Playa Samara/Carrillo Airport	Carrillo	Costa Rica
PLH	237	Plymouth City Airport	Plymouth	United Kingdom
PLL	68	Ponta Pelada Airport	Manaus	Brazil
PLM	161	Sultan Mahmud Badaruddin II Airport	Palembang	Indonesia
PLN	112	Pellston Regional Airport of Emmet County Airport	Pellston	United States
PLO	208	Port Lincoln Airport	Port Lincoln	Australia
PLP	113	Captain Ramon Xatruch Airport	La Palma	Panama
PLQ	259	Palanga International Airport	Palanga	Lithuania
PLS	89	Providenciales Airport	Providenciales	Turks and Caicos Islands
PLU	123	Pampulha - Carlos Drummond de Andrade Airport	Belo Horizonte	Brazil
PLV	234	Suprunovka Airport	Poltava	Ukraine
PLW	171	Mutiara Airport	Palu	Indonesia
PLX	180	Semipalatinsk Airport	Semiplatinsk	Kazakhstan
PLZ	23	Port Elizabeth Airport	Port Elizabeth	South Africa
PMA	16	Pemba Airport	Pemba	Tanzania
PMB	77	Pembina Municipal Airport	Pembina	United States
PMC	121	El Tepual Airport	Puerto Montt	Chile
PMD	102	Palmdale Regional/USAF Plant 42 Airport	Palmdale	United States
PMF	249	Parma Airport	Parma	Italy
PMG	71	Ponta Porã Airport	Ponta Pora	Brazil
PMI	239	Palma De Mallorca Airport	Palma de Mallorca	Spain
PMK	209	Palm Island Airport	Palm Island	Australia
PML	52	Port Moller Airport	Cold Bay	United States
PMO	249	Falcone–Borsellino Airport	Palermo	Italy
PMQ	56	Perito Moreno Airport	Perito Moreno	Argentina
PMR	274	Palmerston North Airport	Palmerston North	New Zealand
PMS	152	Palmyra Airport	Palmyra	Syria
PMV	73	Del Caribe Santiago Mariño International Airport	Porlamar	Venezuela
PMW	87	Brigadeiro Lysias Rodrigues Airport	Palmas	Brazil
PMY	74	El Tehuelche Airport	Puerto Madryn	Argentina
PMZ	80	Palmar Sur Airport	Palmar Sur	Costa Rica
PNA	239	Pamplona Airport	Pamplona	Spain
PNB	87	Porto Nacional Airport	Porto Nacional	Brazil
PNC	77	Ponca City Regional Airport	Ponca City	United States
PNE	112	Northeast Philadelphia Airport	Philadelphia	United States
PNH	177	Phnom Penh International Airport	Phnom-penh	Cambodia
PNI	297	Pohnpei International Airport	Pohnpei	Micronesia
PNK	161	Supadio Airport	Pontianak	Indonesia
PNL	249	Pantelleria Airport	Pantelleria	Italy
PNP	298	Girua Airport	Girua	Papua New Guinea
PNQ	150	Pune Airport	Pune	India
PNR	10	Pointe Noire Airport	Pointe-noire	Congo (Brazzaville)
PNS	77	Pensacola Regional Airport	Pensacola	United States
PNT	121	Tte. Julio Gallardo Airport	Puerto Natales	Chile
PNV	259	Panevėžys Air Base	Panevezys	Lithuania
PNY	150	Pondicherry Airport	Pendicherry	India
PNZ	87	Senador Nilo Coelho Airport	Petrolina	Brazil
POA	123	Salgado Filho Airport	Porto Alegre	Brazil
POB	112	Pope Field	Fort Bragg	United States
POC	102	Brackett Field	La Verne	United States
POE	77	Polk Army Air Field	Fort Polk	United States
POF	77	Poplar Bluff Municipal Airport	Poplar Bluff	United States
POG	30	Port Gentil Airport	Port Gentil	Gabon
POI	100	Capitan Nicolas Rojas Airport	Potosi	Bolivia
POJ	123	Patos de Minas Airport	Patos de Minas	Brazil
POL	36	Pemba Airport	Pemba	Mozambique
POM	298	Port Moresby Jacksons International Airport	Port Moresby	Papua New Guinea
POO	123	Poços de Caldas - Embaixador Walther Moreira Salles Airport	Pocos De Caldas	Brazil
POP	122	Gregorio Luperon International Airport	Puerto Plata	Dominican Republic
POR	229	Pori Airport	Pori	Finland
POS	117	Piarco International Airport	Port-of-spain	Trinidad and Tobago
POT	98	Ken Jones Airport	Port Antonio	Jamaica
POW	236	Portoroz Airport	Portoroz	Slovenia
POX	245	Pontoise - Cormeilles-en-Vexin Airport	Pontoise	France
POZ	260	Poznań-Ławica Airport	Poznan	Poland
PPB	123	Presidente Prudente Airport	President Prudente	Brazil
PPC	52	Prospect Creek Airport	Prospect Creek	United States
PPE	97	Mar de Cortés International Airport	Punta Penasco	Mexico
PPG	295	Pago Pago International Airport	Pago Pago	American Samoa
PPK	180	Petropavlosk South Airport	Petropavlosk	Kazakhstan
PPL	166	Phaplu Airport	Phaplu	Nepal
PPM	112	Pompano Beach Airpark	Pompano Beach	United States
PPN	69	Guillermo León Valencia Airport	Popayan	Colombia
PPP	209	Proserpine Whitsunday Coast Airport	Prosserpine	Australia
PPQ	274	Paraparaumu Airport	Paraparaumu	New Zealand
PPS	172	Puerto Princesa Airport	Puerto Princesa	Philippines
PPT	301	Faa'a International Airport	Papeete	French Polynesia
PPW	237	Papa Westray Airport	Papa Westray	United Kingdom
PQC	183	Phu Quoc International Airport	Phuquoc	Vietnam
PQI	112	Northern Maine Regional Airport at Presque Isle	Presque Isle	United States
PQQ	215	Port Macquarie Airport	Port Macquarie	Australia
PRA	79	General Urquiza Airport	Parana	Argentina
PRC	115	Ernest A. Love Field	Prescott	United States
PRG	247	Václav Havel Airport Prague	Prague	Czech Republic
PRH	146	Phrae Airport	Phrae	Thailand
PRI	268	Praslin Airport	Praslin	Seychelles
PRM	235	Portimão Airport	Portimao	Portugal
PRN	218	Priština International Airport	Pristina	Serbia
PRP	245	Propriano Airport	Propriano	France
PRQ	79	Termal Airport	Presidencia R.s.pena	Argentina
PRU	181	Pyay Airport	Pyay	Burma
PRV	247	Přerov Air Base	Prerov	Czech Republic
PRY	23	Wonderboom Airport	Pretoria	South Africa
PRZ	102	Prineville Airport	Prineville	United States
PSA	249	Pisa International Airport	Pisa	Italy
PSC	102	Tri Cities Airport	Pasco	United States
PSD	12	Port Said Airport	Port Said	Egypt
PSE	118	Mercedita Airport	Ponce	Puerto Rico
PSG	52	Petersburg James A Johnson Airport	Petersburg	United States
PSH	219	St. Peter-Ording Airport	Sankt Peter-Ording	Germany
PSI	165	Pasni Airport	Pasni	Pakistan
PSJ	171	Kasiguncu Airport	Poso	Indonesia
PSL	237	Perth/Scone Airport	Perth	United Kingdom
PSM	112	Portsmouth International at Pease Airport	Portsmouth	United States
PSO	69	Antonio Narino Airport	Pasto	Colombia
PSP	102	Palm Springs International Airport	Palm Springs	United States
PSR	249	Pescara International Airport	Pescara	Italy
PSS	79	Libertador Gral D Jose De San Martin Airport	Posadas	Argentina
PSU	161	Pangsuma Airport	Putussibau-Borneo Island	Indonesia
PSX	77	Palacios Municipal Airport	Palacios	United States
PSY	207	Port Stanley Airport	Stanley	Falkland Islands
PSZ	100	Capitán Av. Salvador Ogaya G. airport	Puerto Suarez	Bolivia
PTA	52	Port Alsworth Airport	Port alsworth	United States
PTB	112	Dinwiddie County Airport	Petersburg	United States
PTF	279	Malolo Lailai Island Airport	Malolo Lailai Island	Fiji
PTG	23	Polokwane International Airport	Potgietersrus	South Africa
PTH	52	Port Heiden Airport	Port Heiden	United States
PTJ	211	Portland Airport	Portland	Australia
PTK	112	Oakland County International Airport	Pontiac	United States
PTM	73	Palmarito Airport	Palmarito	Venezuela
PTP	91	Pointe-à-Pitre Le Raizet	Pointe-a-pitre	Guadeloupe
PTU	52	Platinum Airport	Port Moller	United States
PTX	69	Pitalito Airport	Pitalito	Colombia
PTY	113	Tocumen International Airport	Panama City	Panama
PTZ	93	Rio Amazonas Airport	Pastaza	Ecuador
PUB	83	Pueblo Memorial Airport	Pueblo	United States
PUC	83	Carbon County Regional/Buck Davis Field	Price	United States
PUD	56	Puerto Deseado Airport	Puerto Deseado	Argentina
PUE	113	Puerto Obaldia Airport	Puerto Obaldia	Panama
PUF	245	Pau Pyrénées Airport	Pau	France
PUG	208	Port Augusta Airport	Argyle	Australia
PUJ	122	Punta Cana International Airport	Punta Cana	Dominican Republic
PUQ	121	Pdte. Carlos Ibañez del Campo Airport	Punta Arenas	Chile
PUR	100	Puerto Rico Airport	Puerto Rico/Manuripi	Bolivia
PUS	185	Gimhae International Airport	Busan	South Korea
PUU	69	Tres De Mayo Airport	Puerto Asis	Colombia
PUW	102	Pullman Moscow Regional Airport	Pullman	United States
PUY	261	Pula Airport	Pula	Croatia
PUZ	103	Puerto Cabezas Airport	Puerto Cabezas	Nicaragua
PVA	69	El Embrujo Airport	Providencia	Colombia
PVC	112	Provincetown Municipal Airport	Provincetown	United States
PVD	112	Theodore Francis Green State Airport	Providence	United States
PVG	186	Shanghai Pudong International Airport	Shanghai	China
PVH	68	Governador Jorge Teixeira de Oliveira Airport	Porto Velho	Brazil
PVK	217	Aktion National Airport	Preveza	Greece
PVL	112	Pike County-Hatcher Field	Pikeville	United States
PVO	93	Reales Tamarindos Airport	Portoviejo	Ecuador
PVR	107	Licenciado Gustavo Díaz Ordaz International Airport	Puerto Vallarta	Mexico
PVS	141	Provideniya Bay Airport	Provideniya Bay	Russia
PVU	83	Provo Municipal Airport	Provo	United States
PWA	77	Wiley Post Airport	Oklahoma City	United States
PWK	77	Chicago Executive Airport	Chicago-Wheeling	United States
PWM	112	Portland International Jetport Airport	Portland	United States
PWQ	180	Pavlodar Airport	Pavlodar	Kazakhstan
PWT	102	Bremerton National Airport	Bremerton	United States
PXH	208	Prominent Hill Airport	Prominent Hill	Australia
PXM	107	Puerto Escondido International Airport	Puerto Escondido	Mexico
PXO	235	Porto Santo Airport	Porto Santo	Portugal
PXR	146	Surin Airport	Surin	Thailand
PXU	183	Pleiku Airport	Pleiku	Vietnam
PYE	299	Tongareva Airport	Penrhyn Island	Cook Islands
PYH	73	Cacique Aramare Airport	Puerto Ayacucho	Venezuela
PYJ	197	Polyarny Airport	Yakutia	Russia
PYM	112	Plymouth Municipal Airport	Plymouth	United States
PYR	217	Andravida Air Base	Andravida	Greece
PYY	146	Mae Hong Son Airport	Pai	Thailand
PZB	23	Pietermaritzburg Airport	Pietermaritzburg	South Africa
PZE	237	Penzance Heliport	Penzance	United Kingdom
PZH	165	Zhob Airport	Zhob	Pakistan
PZI	186	Bao'anying Airport	Panzhihua	China
PZO	73	General Manuel Carlos Piar International Airport	Guayana	Venezuela
PZS	121	Maquehue Airport	Temuco	Chile
PZU	26	Port Sudan New International Airport	Port Sudan	Sudan
PZY	220	Piešťany Airport	Piestany	Slovakia
QBC	135	Bella Coola Airport	Bella Coola	Canada
QCJ	123	Botucatu - Tancredo de Almeida Neves Airport	Botucatu	Brazil
QCY	237	RAF Coningsby	Coningsby	United Kingdom
QDJ	3	Tsletsi Airport	Djelfa	Algeria
QEF	219	Frankfurt-Egelsbach Airport	Egelsbach	Germany
QFO	237	Duxford Aerodrome	Duxford	United Kingdom
QGU	193	Gifu Airport	Gifu	Japan
QHR	2	Harar Meda Airport	Debre Zeyit	Ethiopia
QIG	87	Iguatu Airport	Iguatu	Brazil
QJB	182	Jubail Airport	Jubail	Saudi Arabia
QLA	237	Lasham Airport	Lasham	United Kingdom
QLD	3	Blida Airport	Blida	Algeria
QLF	229	Lahti Vesivehmaa Airport	Vesivehmaa	Finland
QLR	235	Monte Real Air Base	Monte Real	Portugal
QLS	262	Lausanne-Blécherette Airport	Lausanne	Switzerland
QLT	249	Latina Air Base	Latina	Italy
QNC	262	Neuchatel Airport	Neuchatel	Switzerland
QNJ	245	Annemasse Airport	Annemasse	France
QNV	123	Aeroclube Airport	Nova Iguacu	Brazil
QOW	29	Sam Mbakwe International Airport	Imo	Nigeria
QPA	249	Padova Airport	Padova	Italy
QPD	96	Pinar Del Rio Airport	Pinar Del Rio Norte	Cuba
QPG	187	Paya Lebar Air Base	Paya Lebar	Singapore
QPS	123	Campo Fontenelle Airport	Piracununga	Brazil
QRA	23	Rand Airport	Johannesburg	South Africa
QRC	121	De La Independencia Airport	Rancagua	Chile
QRO	107	Querétaro Intercontinental Airport	Queretaro	Mexico
QRW	29	Warri Airport	Osubi	Nigeria
QSA	239	Sabadell Airport	Sabadell	Spain
QSC	123	Mário Pereira Lopes–São Carlos Airport	Sao Carlos	Brazil
QSF	3	Ain Arnat Airport	Setif	Algeria
QSR	249	Salerno Costa d'Amalfi Airport	Salerno	Italy
QUO	29	Akwa Ibom International Airport	Uyo	Nigeria
QUY	237	RAF Wyton	Wyton	United Kingdom
QXH	219	Schönhagen Airport	Schoenhagen	Germany
QYD	260	Oksywie Military Air Base	Gdynia	Poland
RAB	298	Tokua Airport	Tokua	Papua New Guinea
RAC	77	John H Batten Airport	Racine	United States
RAE	182	Arar Domestic Airport	Arar	Saudi Arabia
RAH	182	Rafha Domestic Airport	Rafha	Saudi Arabia
RAI	203	Praia International Airport	Praia, Santiago Island	Cape Verde
RAJ	150	Rajkot Airport	Rajkot	India
RAK	13	Menara Airport	Marrakech	Morocco
RAL	102	Riverside Municipal Airport	Riverside	United States
RAM	210	Ramingining Airport	Ramingining	Australia
RAO	123	Leite Lopes Airport	Ribeirao Preto	Brazil
RAP	83	Rapid City Regional Airport	Rapid City	United States
RAR	299	Rarotonga International Airport	Avarua	Cook Islands
RAS	191	Sardar-e-Jangal Airport	Rasht	Iran
RAT	198	Raduzhny Airport	Raduzhnyi	Russia
RAZ	165	Rawalakot Airport	Rawala Kot	Pakistan
RBA	13	Rabat-Salé Airport	Rabat	Morocco
RBB	68	Borba Airport	Borba	Brazil
RBD	77	Dallas Executive Airport	Dallas	United States
RBE	177	Ratanakiri Airport	Ratanakiri	Cambodia
RBK	102	French Valley Airport	Murrieta-Temecula	United States
RBL	102	Red Bluff Municipal Airport	Red Bluff	United States
RBM	219	Straubing Airport	Straubing	Germany
RBQ	100	Rurenabaque Airport	Rerrenabaque	Bolivia
RBR	120	Plácido de Castro Airport	Rio Branco	Brazil
RBV	283	Ramata Airport	Ramata	Solomon Islands
RBX	24	Rumbek Airport	Rumbek	Sudan
RBY	52	Ruby Airport	Ruby	United States
RCA	83	Ellsworth Air Force Base	Rapid City	United States
RCB	23	Richards Bay Airport	Richard's Bay	South Africa
RCH	69	Almirante Padilla Airport	Rio Hacha	Colombia
RCL	277	Redcliffe Airport	Redcliffe	Vanuatu
RCO	245	Rochefort-Saint-Agnant (BA 721) Airport	Rochefort	France
RCQ	79	Reconquista Airport	Reconquista	Argentina
RCS	237	Rochester Airport	Rochester	United Kingdom
RCU	79	Area De Material Airport	Rio Cuarto	Argentina
RCY	111	Rum Cay Airport	Port Nelson	Bahamas
RDC	65	Redenção Airport	Redencao	Brazil
RDD	102	Redding Municipal Airport	Redding	United States
RDG	112	Reading Regional Carl A Spaatz Field	Reading	United States
RDM	102	Roberts Field	Redmond-Bend	United States
RDN	168	LTS Pulau Redang Airport	Redang	Malaysia
RDO	260	Radom Airport	RADOM	Poland
RDR	77	Grand Forks Air Force Base	Red River	United States
RDS	57	Rincon De Los Sauces Airport	Rincon de los Sauces	Argentina
RDU	112	Raleigh Durham International Airport	Raleigh-durham	United States
RDZ	245	Rodez-Marcillac Airport	Rodez	France
REB	219	Rechlin-Lärz Airport	Rechlin-laerz	Germany
REC	87	Guararapes - Gilberto Freyre International Airport	Recife	Brazil
REG	249	Reggio Calabria Airport	Reggio Calabria	Italy
REL	74	Almirante Marco Andres Zar Airport	Trelew	Argentina
REN	198	Orenburg Central Airport	Orenburg	Russia
REP	177	Siem Reap International Airport	Siem-reap	Cambodia
RER	92	Retalhuleu Airport	Retalhuleu	Guatemala
RES	79	Resistencia International Airport	Resistencia	Argentina
RET	244	Røst Airport	Røst	Norway
REU	239	Reus Air Base	Reus	Spain
REX	107	General Lucio Blanco International Airport	Reynosa	Mexico
REY	100	Reyes Airport	Reyes	Bolivia
RFD	77	Chicago Rockford International Airport	Rockford	United States
RFP	301	Raiatea Airport	Raiatea Island	French Polynesia
RFS	103	Rosita Airport	Rosita	Nicaragua
RGA	61	Hermes Quijada International Airport	Rio Grande	Argentina
RGI	301	Rangiroa Airport	Rangiroa	French Polynesia
RGK	167	Gorno-Altaysk Airport	Gorno-Altaysk	Russia
RGL	56	Piloto Civil N. Fernández Airport	Rio Gallegos	Argentina
RGN	181	Yangon International Airport	Yangon	Burma
RGO	178	Orang Airport	Chongjin	North Korea
RGS	239	Burgos Airport	Burgos	Spain
RGT	161	Japura Airport	Rengat	Indonesia
RHD	79	Termas de Río Hondo international Airport	Rio Hondo	Argentina
RHE	245	Reims-Champagne (BA 112) Air Base	Reims	France
RHI	77	Rhinelander Oneida County Airport	Rhinelander	United States
RHO	217	Diagoras Airport	Rhodos	Greece
RHP	166	Ramechhap Airport	Ramechhap	Nepal
RIA	123	Santa Maria Airport	Santa Maria	Brazil
RIB	100	Capitán Av. Selin Zeitun Lopez Airport	Riberalta	Bolivia
RIC	112	Richmond International Airport	Richmond	United States
RIL	83	Garfield County Regional Airport	Rifle	United States
RIN	283	Ringi Cove Airport	Ringi Cove	Solomon Islands
RIS	193	Rishiri Airport	Rishiri Island	Japan
RIV	102	March ARB Airport	Riverside	United States
RIW	83	Riverton Regional Airport	Riverton WY	United States
RIX	248	Riga International Airport	Riga	Latvia
RIY	139	Mukalla International Airport	Mukalla	Yemen
RJA	150	Rajahmundry Airport	Rajahmundry	India
RJH	153	Shah Mokhdum Airport	Rajshahi	Bangladesh
RJK	261	Rijeka Airport	Rijeka	Croatia
RJL	239	Logroño-Agoncillo Airport	Logroño-Agoncillo	Spain
RJN	191	Rafsanjan Airport	Rafsanjan	Iran
RKD	112	Knox County Regional Airport	Rockland	United States
RKE	225	Copenhagen Roskilde Airport	Copenhagen	Denmark
RKH	112	Rock Hill - York County Airport	Rock Hill	United States
RKP	77	Aransas County Airport	Rockport	United States
RKS	83	Southwest Wyoming Regional Airport	Rock Springs	United States
RKT	155	Ras Al Khaimah International Airport	Ras Al Khaimah	United Arab Emirates
RKV	205	Reykjavik Airport	Reykjavik	Iceland
RKZ	186	Shigatse Air Base	Shigatse	China
RLG	219	Rostock-Laage Airport	Laage	Germany
RLK	186	Bayannur Tianjitai Airport	Bayannur	China
RMA	209	Roma Airport	Roma	Australia
RME	112	Griffiss International Airport	Rome	United States
RMF	12	Marsa Alam International Airport	Marsa Alam	Egypt
RMG	112	Richard B Russell Airport	Rome	United States
RMI	249	Federico Fellini International Airport	Rimini	Italy
RMK	208	Renmark Airport	Renmark	Australia
RML	151	Colombo Ratmalana Airport	Colombo	Sri Lanka
RMQ	189	Taichung Ching Chuang Kang Airport	Taichung	Taiwan
RMS	219	Ramstein Air Base	Ramstein	Germany
RMY	102	Mariposa Yosemite Airport	Mariposa	United States
RNA	283	Ulawa Airport	Ulawa	Solomon Islands
RNB	255	Ronneby Airport	Ronneby	Sweden
RND	77	Randolph Air Force Base	San Antonio	United States
RNE	245	Roanne-Renaison Airport	Roanne	France
RNI	103	Corn Island	Corn Island	Nicaragua
RNJ	193	Yoron Airport	Yoron	Japan
RNL	283	Rennell/Tingoa Airport	Rennell Island	Solomon Islands
RNN	225	Bornholm Airport	Ronne	Denmark
RNO	102	Reno Tahoe International Airport	Reno	United States
RNS	245	Rennes-Saint-Jacques Airport	Rennes	France
RNT	102	Renton Municipal Airport	Renton	United States
ROA	112	Roanoke–Blacksburg Regional Airport	Roanoke VA	United States
ROB	40	Roberts International Airport	Monrovia	Liberia
ROC	112	Greater Rochester International Airport	Rochester	United States
ROD	23	Robertson Airport	Robertson	South Africa
ROI	146	Roi Et Airport	Roi Et	Thailand
ROK	209	Rockhampton Airport	Rockhampton	Australia
ROO	71	Maestro Marinho Franco Airport	Rondonopolis	Brazil
ROP	300	Rota International Airport	Rota	Northern Mariana Islands
ROR	296	Babelthuap Airport	Babelthuap	Palau
ROS	79	Islas Malvinas Airport	Rosario	Argentina
ROT	274	Rotorua Regional Airport	Rotorua	New Zealand
ROV	243	Platov International Airport	Rostov	Russia
ROW	83	Roswell International Air Center Airport	Roswell	United States
ROZ	239	Rota Naval Station Airport	Rota	Spain
RPB	210	Roper Bar Airport	Roper Bar	Australia
RPN	163	Ben Ya'akov Airport	Rosh Pina	Israel
RPR	150	Raipur Airport	Raipur	India
RRG	270	Sir Charles Gaetan Duval Airport	Rodriguez Island	Mauritius
RRK	150	Rourkela Airport	Rourkela	India
RRS	244	Røros Airport	Roros	Norway
RSA	57	Santa Rosa Airport	Santa Rosa	Argentina
RSD	111	Rock Sound Airport	Rock Sound	Bahamas
RSH	52	Russian Mission Airport	Russian Mission	United States
RSS	26	Damazin Airport	Damazin	Sudan
RST	77	Rochester International Airport	Rochester	United States
RSU	185	Yeosu Airport	Yeosu	South Korea
RSW	112	Southwest Florida International Airport	Fort Myers	United States
RTA	279	Rotuma Airport	Rotuma	Fiji
RTB	130	Juan Manuel Galvez International Airport	Roatan	Honduras
RTG	171	Frans Sales Lega Airport	Ruteng	Indonesia
RTM	216	Rotterdam The Hague Airport	Rotterdam	Netherlands
RTS	214	Rottnest Island Airport	Rottnest Island	Australia
RTW	243	Saratov Central Airport	Saratov	Russia
RUA	25	Arua Airport	Arua	Uganda
RUD	191	Shahroud Airport	Emam Shahr	Iran
RUH	182	King Khaled International Airport	Riyadh	Saudi Arabia
RUI	83	Sierra Blanca Regional Airport	Ruidoso	United States
RUK	166	Rukum Chaurjahari Airport	Rukumkot	Nepal
RUM	166	Rumjatar Airport	Rumjatar	Nepal
RUN	272	Roland Garros Airport	St.-denis	Reunion
RUS	283	Marau Airport	Marau	Solomon Islands
RUT	112	Rutland - Southern Vermont Regional Airport	Rutland	United States
RVA	263	Farafangana Airport	Farafangana	Madagascar
RVD	123	General Leite de Castro Airport	Rio Verde	Brazil
RVE	69	Los Colonizadores Airport	Saravena	Colombia
RVK	244	Rørvik Airport, Ryum	Rørvik	Norway
RVN	229	Rovaniemi Airport	Rovaniemi	Finland
RVS	77	Richard Lloyd Jones Jr Airport	Tulsa	United States
RVT	214	Ravensthorpe Airport	Ravensthorpe	Australia
RVV	301	Raivavae Airport	Raivavae	French Polynesia
RVY	109	Presidente General Don Oscar D. Gestido International Airport	Rivera	Uruguay
RWI	112	Rocky Mount Wilson Regional Airport	Rocky Mount	United States
RWL	83	Rawlins Municipal Airport/Harvey Field	Rawlins	United States
RWN	234	Rivne International Airport	Rivne	Ukraine
RXS	172	Roxas Airport	Roxas City	Philippines
RYB	243	Staroselye Airport	Rybinsk	Russia
RYG	244	Moss Airport, Rygge	Rygge	Norway
RYK	165	Shaikh Zaid Airport	Rahim Yar Khan	Pakistan
RYN	245	Royan-Médis Airport	Royan	France
RZA	56	Santa Cruz Airport	Santa Cruz	Argentina
RZE	260	Rzeszów-Jasionka Airport	Rzeszow	Poland
RZP	172	Cesar Lim Rodriguez Airport	Taytay	Philippines
RZR	191	Ramsar Airport	Ramsar	Iran
SAA	83	Shively Field	SARATOGA	United States
SAB	81	Juancho E. Yrausquin Airport	Saba	Netherlands Antilles
SAC	102	Sacramento Executive Airport	Sacramento	United States
SAD	115	Safford Regional Airport	Safford	United States
SAF	83	Santa Fe Municipal Airport	Santa Fe	United States
SAH	139	Sana'a International Airport	Sanaa	Yemen
SAK	205	Sauðárkrókur Airport	Saudarkrokur	Iceland
SAL	86	Monseñor Óscar Arnulfo Romero International Airport	San Salvador	El Salvador
SAN	102	San Diego International Airport	San Diego	United States
SAP	130	Ramón Villeda Morales International Airport	San Pedro Sula	Honduras
SAQ	111	San Andros Airport	San Andros	Bahamas
SAT	77	San Antonio International Airport	San Antonio	United States
SAV	112	Savannah Hilton Head International Airport	Savannah	United States
SAW	231	Sabiha Gökçen International Airport	Istanbul	Turkey
SAY	249	Siena-Ampugnano Airport	Siena	Italy
SBA	102	Santa Barbara Municipal Airport	Santa Barbara	United States
SBB	73	Santa Bárbara de Barinas Airport	Santa Barbara	Venezuela
SBD	102	San Bernardino International Airport	San Bernardino	United States
SBG	161	Maimun Saleh Airport	Sabang	Indonesia
SBK	245	Saint-Brieuc-Armor Airport	St.-brieuc Armor	France
SBL	100	Santa Ana Del Yacuma Airport	Santa Ana	Bolivia
SBM	77	Sheboygan County Memorial Airport	Sheboygan	United States
SBN	112	South Bend Regional Airport	South Bend	United States
SBP	102	San Luis County Regional Airport	San Luis Obispo	United States
SBR	209	Saibai Island Airport	Saibai Island	Australia
SBS	83	Steamboat Springs Bob Adams Field	Steamboat Springs	United States
SBU	23	Springbok Airport	Springbok	South Africa
SBW	168	Sibu Airport	Sibu	Malaysia
SBY	112	Salisbury Ocean City Wicomico Regional Airport	Salisbury	United States
SBZ	222	Sibiu International Airport	Sibiu	Romania
SCC	52	Deadhorse Airport	Deadhorse	United States
SCE	112	University Park Airport	State College Pennsylvania	United States
SCF	115	Scottsdale Airport	Scottsdale	United States
SCH	112	Schenectady County Airport	Scotia NY	United States
SCI	73	Paramillo Airport	San Cristobal	Venezuela
SCK	102	Stockton Metropolitan Airport	Stockton	United States
SCL	121	Comodoro Arturo Merino Benítez International Airport	Santiago	Chile
SCM	52	Scammon Bay Airport	Scammon Bay	United States
SCN	219	Saarbrücken Airport	Saarbruecken	Germany
SCO	176	Aktau Airport	Aktau	Kazakhstan
SCQ	239	Santiago de Compostela Airport	Santiago	Spain
SCS	237	Scatsta Airport	Scatsta	United Kingdom
SCT	139	Socotra International Airport	Socotra	Yemen
SCU	96	Antonio Maceo International Airport	Santiago De Cuba	Cuba
SCV	222	Suceava Stefan cel Mare Airport	Suceava	Romania
SCW	243	Syktyvkar Airport	Syktyvkar	Russia
SCY	281	San Cristóbal Airport	San Cristóbal	Ecuador
SCZ	283	Santa Cruz/Graciosa Bay/Luova Airport	Santa Cruz/Graciosa Bay/Luova	Solomon Islands
SDB	23	Langebaanweg Airport	Langebaanweg	South Africa
SDD	32	Lubango Airport	Lubango	Angola
SDE	79	Vicecomodoro Angel D. La Paz Aragonés Airport	Santiago Del Estero	Argentina
SDF	112	Louisville International Standiford Field	Louisville	United States
SDG	191	Sanandaj Airport	Sanandaj	Iran
SDJ	193	Sendai Airport	Sendai	Japan
SDK	168	Sandakan Airport	Sandakan	Malaysia
SDL	255	Sundsvall-Härnösand Airport	Sundsvall	Sweden
SDM	102	Brown Field Municipal Airport	San Diego	United States
SDN	244	Sandane Airport (Anda)	Sandane	Norway
SDP	52	Sand Point Airport	Sand Point	United States
SDQ	122	Las Américas International Airport	Santo Domingo	Dominican Republic
SDR	239	Santander Airport	Santander	Spain
SDS	193	Sado Airport	Sado	Japan
SDT	165	Saidu Sharif Airport	Saidu Sharif	Pakistan
SDU	123	Santos Dumont Airport	Rio De Janeiro	Brazil
SDV	163	Sde Dov Airport	Tel-aviv	Israel
SDX	115	Sedona Airport	Sedona	United States
SDY	83	Sidney - Richland Regional Airport	Sidney	United States
SEA	102	Seattle Tacoma International Airport	Seattle	United States
SEB	48	Sabha Airport	Sebha	Libya
SEE	102	Gillespie Field	El Cajon	United States
SEF	112	Sebring Regional Airport	Sebring	United States
SEH	162	Senggeh Airport	Senggeh-Papua Island	Indonesia
SEK	188	Srednekolymsk Airport	Srednekolymsk	Russia
SEM	77	Craig Field	Selma	United States
SEN	237	Southend Airport	Southend	United Kingdom
SEP	77	Stephenville Clark Regional Airport	Stephenville	United States
SEU	16	Seronera Airport	Seronera	Tanzania
SEY	44	Sélibaby Airport	Selibabi	Mauritania
SEZ	268	Seychelles International Airport	Mahe	Seychelles
SFA	49	Sfax Thyna International Airport	Sfax	Tunisia
SFB	112	Orlando Sanford International Airport	Sanford	United States
SFC	91	St-François Airport	St-François	Guadeloupe
SFD	73	San Fernando De Apure Airport	San Fernando De Apure	Venezuela
SFE	172	San Fernando Airport	San Fernando	Philippines
SFF	102	Felts Field	Spokane	United States
SFH	132	San Felipe International Airport	San Filipe	Mexico
SFJ	88	Kangerlussuaq Airport	Sondrestrom	Greenland
SFK	65	Soure Airport	Soure	Brazil
SFL	203	São Filipe Airport	Sao Filipe, Fogo Island	Cape Verde
SFN	79	Sauce Viejo Airport	Santa Fe	Argentina
SFO	102	San Francisco International Airport	San Francisco	United States
SFQ	231	Şanlıurfa Airport	Sanliurfa	Turkey
SFS	172	Subic Bay International Airport	Olongapo City	Philippines
SFT	255	Skellefteå Airport	Skelleftea	Sweden
SFZ	112	North Central State Airport	Smithfield	United States
SGC	198	Surgut Airport	Surgut	Russia
SGD	225	Sønderborg Airport	Soenderborg	Denmark
SGE	219	Siegerland Airport	Siegerland	Germany
SGF	77	Springfield Branson National Airport	Springfield	United States
SGH	112	Springfield-Beckley Municipal Airport	Springfield	United States
SGN	183	Tan Son Nhat International Airport	Ho Chi Minh City	Vietnam
SGO	209	St George Airport	St George	Australia
SGR	77	Sugar Land Regional Airport	Sugar Land	United States
SGU	83	St George Municipal Airport	Saint George	United States
SGV	57	Sierra Grande Airport	Sierra Grande	Argentina
SGX	16	Songea Airport	Songea	Tanzania
SGY	52	Skagway Airport	Skagway	United States
SGZ	146	Songkhla Airport	Songkhla	Thailand
SHA	186	Shanghai Hongqiao International Airport	Shanghai	China
SHB	193	Nakashibetsu Airport	Nakashibetsu	Japan
SHD	112	Shenandoah Valley Regional Airport	Weyers Cave	United States
SHE	186	Taoxian Airport	Shenyang	China
SHG	52	Shungnak Airport	Shungnak	United States
SHH	52	Shishmaref Airport	Shishmaref	United States
SHI	193	Shimojishima Airport	Shimojishima	Japan
SHJ	155	Sharjah International Airport	Sharjah	United Arab Emirates
SHL	150	Shillong Airport	Shillong	India
SHM	193	Nanki Shirahama Airport	Nanki-shirahama	Japan
SHN	102	Sanderson Field	Shelton	United States
SHP	186	Shanhaiguan Airport	Qinhuangdao	China
SHR	83	Sheridan County Airport	Sheridan	United States
SHT	211	Shepparton Airport	Shepparton	Australia
SHV	77	Shreveport Regional Airport	Shreveport	United States
SHW	182	Sharurah Airport	Sharurah	Saudi Arabia
SHX	52	Shageluk Airport	Shageluk	United States
SHY	16	Shinyanga Airport	Shinyanga	Tanzania
SIA	186	Xi'an Xiguan Airport	Xi'AN	China
SID	203	Amílcar Cabral International Airport	Amilcar Cabral	Cape Verde
SIF	166	Simara Airport	Simara	Nepal
SIG	118	Fernando Luis Ribas Dominicci Airport	San Juan	Puerto Rico
SIJ	205	Siglufjörður Airport	Siglufjordur	Iceland
SIK	77	Sikeston Memorial Municipal Airport	Sikeston	United States
SIN	187	Singapore Changi Airport	Singapore	Singapore
SIP	252	Simferopol International Airport	Simferopol	Ukraine
SIQ	161	Dabo Airport	Singkep	Indonesia
SIR	262	Sion Airport	Sion	Switzerland
SIS	23	Sishen Airport	Sishen	South Africa
SIT	52	Sitka Rocky Gutierrez Airport	Sitka	United States
SIU	103	Siuna	Siuna	Nicaragua
SJC	102	Norman Y. Mineta San Jose International Airport	San Jose	United States
SJD	105	Los Cabos International Airport	San Jose Del Cabo	Mexico
SJE	69	Jorge E. Gonzalez Torres Airport	San Jose Del Guaviare	Colombia
SJI	172	San Jose Airport	San Jose	Philippines
SJJ	251	Sarajevo International Airport	Sarajevo	Bosnia and Herzegovina
SJK	123	Professor Urbano Ernesto Stumpf Airport	Sao Jose Dos Campos	Brazil
SJL	68	São Gabriel da Cachoeira Airport	Sao Gabriel	Brazil
SJO	80	Juan Santamaria International Airport	San Jose	Costa Rica
SJP	123	Prof. Eribelto Manoel Reino State Airport	Sao Jose Do Rio Preto	Brazil
SJT	77	San Angelo Regional Mathis Field	San Angelo	United States
SJU	118	Luis Munoz Marin International Airport	San Juan	Puerto Rico
SJW	186	Shijiazhuang Daguocun International Airport	Shijiazhuang	China
SJY	229	Seinäjoki Airport	Seinäjoki / Ilmajoki	Finland
SJZ	200	São Jorge Airport	Sao Jorge Island	Portugal
SKA	102	Fairchild Air Force Base	Spokane	United States
SKB	126	Robert L. Bradshaw International Airport	Basse Terre	Saint Kitts and Nevis
SKD	184	Samarkand Airport	Samarkand	Uzbekistan
SKE	244	Skien Airport	Skien	Norway
SKF	77	Lackland Air Force Base	San Antonio	United States
SKG	217	Thessaloniki Macedonia International Airport	Thessaloniki	Greece
SKH	166	Surkhet Airport	Surkhet	Nepal
SKK	52	Shaktoolik Airport	Shaktoolik	United States
SKN	244	Stokmarknes Skagen Airport	Stokmarknes	Norway
SKO	29	Sadiq Abubakar III International Airport	Sokoto	Nigeria
SKP	253	Skopje Alexander the Great Airport	Skopje	Macedonia
SKS	225	Skrydstrup Air Base	Skrydstrup	Denmark
SKT	165	Sialkot Airport	Sialkot	Pakistan
SKU	217	Skiros Airport	Skiros	Greece
SKV	12	St Catherine International Airport	St. Catherine	Egypt
SKX	243	Saransk Airport	Saransk	Russia
SKY	112	Griffing Sandusky Airport	Sandusky	United States
SKZ	165	Sukkur Airport	Sukkur	Pakistan
SLA	57	Martin Miguel De Guemes International Airport	Salta	Argentina
SLC	83	Salt Lake City International Airport	Salt Lake City	United States
SLD	220	Sliač Airport	Sliac	Slovakia
SLE	102	Salem Municipal Airport/McNary Field	Salem	United States
SLF	182	Sulayel Airport	Sulayel	Saudi Arabia
SLH	277	Sola Airport	Sola	Vanuatu
SLJ	214	Solomon Airport	Solomon	Australia
SLK	112	Adirondack Regional Airport	Saranac Lake	United States
SLL	173	Salalah Airport	Salalah	Oman
SLM	239	Salamanca Airport	Salamanca	Spain
SLN	77	Salina Municipal Airport	Salina	United States
SLP	107	Ponciano Arriaga International Airport	San Luis Potosi	Mexico
SLQ	52	Sleetmute Airport	Sleetmute	United States
SLU	127	George F. L. Charles Airport	Castries	Saint Lucia
SLV	150	Shimla Airport	Shimla	India
SLW	107	Plan De Guadalupe International Airport	Saltillo	Mexico
SLX	89	Salt Cay Airport	Salt Cay	Turks and Caicos Islands
SLY	198	Salekhard Airport	Salekhard	Russia
SLZ	87	Marechal Cunha Machado International Airport	Sao Luis	Brazil
SMA	200	Santa Maria Airport	Santa Maria (island)	Portugal
SMD	112	Smith Field	Fort Wayne IN	United States
SME	112	Lake Cumberland Regional Airport	Somerset	United States
SMF	102	Sacramento International Airport	Sacramento	United States
SMI	217	Samos Airport	Samos	Greece
SMK	52	St Michael Airport	St. Michael	United States
SML	111	Stella Maris Airport	Stella Maris	Bahamas
SMN	83	Lemhi County Airport	Salmon	United States
SMO	102	Santa Monica Municipal Airport	Santa Monica	United States
SMQ	161	Sampit(Hasan) Airport	Sampit-Borneo Island	Indonesia
SMR	69	Simón Bolívar International Airport	Santa Marta	Colombia
SMS	263	Sainte Marie Airport	Sainte Marie	Madagascar
SMV	262	Samedan Airport	Samedan	Switzerland
SMW	19	Smara Airport	Smara	Western Sahara
SMX	102	Santa Maria Pub/Capt G Allan Hancock Field	Santa Maria	United States
SMZ	114	Stoelmanseiland Airport	Stoelmans Eiland	Suriname
SNA	102	John Wayne Airport-Orange County Airport	Santa Ana	United States
SNC	93	General Ulpiano Paez Airport	Salinas	Ecuador
SNE	203	Preguiça Airport	Sao Nocolau Island	Cape Verde
SNF	73	Sub Teniente Nestor Arias Airport	San Felipe	Venezuela
SNN	226	Shannon Airport	Shannon	Ireland
SNO	146	Sakon Nakhon Airport	Sakon Nakhon	Thailand
SNP	52	St Paul Island Airport	St. Paul Island	United States
SNR	245	Saint-Nazaire-Montoir Airport	St.-nazaire	France
SNU	96	Abel Santamaria Airport	Santa Clara	Cuba
SNV	73	Santa Elena de Uairen Airport	Santa Ana De Uairen	Venezuela
SNW	181	Thandwe Airport	Thandwe	Burma
SNY	83	Sidney Municipal-Lloyd W Carr Field	Sidney	United States
SNZ	123	Santa Cruz Air Force Base	Rio De Janeiro	Brazil
SOB	223	Sármellék International Airport	Sármellék	Hungary
SOC	161	Adi Sumarmo Wiryokusumo Airport	Solo City	Indonesia
SOD	123	Sorocaba Airport	Sorocaba	Brazil
SOF	254	Sofia Airport	Sofia	Bulgaria
SOG	244	Sogndal Airport	Sogndal	Norway
SOJ	244	Sørkjosen Airport	Sorkjosen	Norway
SOM	73	San Tomé Airport	San Tome	Venezuela
SON	277	Santo Pekoa International Airport	Santo	Vanuatu
SOO	255	Söderhamn Airport	Soderhamn	Sweden
SOP	112	Moore County Airport	Pinehurst-Southern Pines	United States
SOQ	162	Dominique Edward Osok Airport	Sorong	Indonesia
SOT	229	Sodankyla Airport	Sodankyla	Finland
SOU	237	Southampton Airport	Southampton	United Kingdom
SOW	115	Show Low Regional Airport	Show Low	United States
SOY	237	Stronsay Airport	Stronsay	United Kingdom
SOZ	245	Solenzara (BA 126) Air Base	Solenzara	France
SPB	128	Charlotte Amalie Harbor Seaplane Base	Charlotte Amalie	Virgin Islands
SPC	202	La Palma Airport	Santa Cruz De La Palma	Spain
SPD	153	Saidpur Airport	Saidpur	Bangladesh
SPF	83	Black Hills Airport-Clyde Ice Field	Spearfish-South Dakota	United States
SPG	112	Albert Whitted Airport	St. Petersburg	United States
SPI	77	Abraham Lincoln Capital Airport	Springfield	United States
SPJ	217	Sparti Airport	Sparti	Greece
SPM	219	Spangdahlem Air Base	Spangdahlem	Germany
SPN	300	Saipan International Airport	Saipan	Northern Mariana Islands
SPP	32	Menongue Airport	Menongue	Angola
SPR	66	San Pedro Airport	San Pedro	Belize
SPS	77	Sheppard Air Force Base-Wichita Falls Municipal Airport	Wichita Falls	United States
SPU	261	Split Airport	Split	Croatia
SPW	77	Spencer Municipal Airport	Spencer	United States
SPY	0	San Pedro Airport	San Pedro	Cote d'Ivoire
SQG	161	Sintang(Susilo) Airport	Sintang-Borneo Island	Indonesia
SQH	183	Na-San Airport	Son-La	Vietnam
SQL	102	San Carlos Airport	San Carlos	United States
SQO	255	Storuman Airport	Mohed	Sweden
SQQ	259	Šiauliai International Airport	Siauliai	Lithuania
SQR	171	Soroako Airport	Soroako	Indonesia
SQW	225	Skive Airport	Skive	Denmark
SQZ	237	RAF Scampton	Scampton	United Kingdom
SRA	123	Santa Rosa Airport	Santa Rosa	Brazil
SRE	100	Juana Azurduy De Padilla Airport	Sucre	Bolivia
SRG	161	Achmad Yani Airport	Semarang	Indonesia
SRH	42	Sarh Airport	Sarh	Chad
SRI	171	Temindung Airport	Samarinda	Indonesia
SRJ	100	Capitán Av. German Quiroga G. Airport	San Borja	Bolivia
SRN	213	Strahan Airport	Strahan	Australia
SRP	244	Stord Airport	Stord	Norway
SRQ	112	Sarasota Bradenton International Airport	Sarasota	United States
SRT	25	Soroti Airport	Soroti	Uganda
SRX	48	Gardabya Airport	Sirt	Libya
SRY	191	Dasht-e Naz Airport	Dasht-e-naz	Iran
SRZ	100	El Trompillo Airport	Santa Cruz	Bolivia
SSA	87	Deputado Luiz Eduardo Magalhães International Airport	Salvador	Brazil
SSC	112	Shaw Air Force Base	Sumter	United States
SSE	150	Solapur Airport	Sholapur	India
SSG	35	Malabo Airport	Malabo	Equatorial Guinea
SSH	12	Sharm El Sheikh International Airport	Sharm El Sheikh	Egypt
SSI	112	Malcolm McKinnon Airport	Brunswick	United States
SSJ	244	Sandnessjøen Airport (Stokka)	Sandnessjoen	Norway
SSN	185	Seoul Air Base (K-16)	Seoul East	South Korea
SSR	277	Sara Airport	Pentecost Island	Vanuatu
SST	70	Santa Teresita Airport	Santa Teresita	Argentina
SSY	32	Mbanza Congo Airport	M'banza-congo	Angola
SSZ	123	Base Aérea de Santos Airport	Santos	Brazil
STA	225	Stauning Airport	Stauning	Denmark
STB	73	Santa Bárbara del Zulia Airport	Santa Barbara	Venezuela
STC	77	St Cloud Regional Airport	Saint Cloud	United States
STD	73	Mayor Buenaventura Vivas International Airport	Santo Domingo	Venezuela
STE	77	Stevens Point Municipal Airport	Stevens Point	United States
STG	52	St George Airport	Point Barrow	United States
STI	122	Cibao International Airport	Santiago	Dominican Republic
STJ	77	Rosecrans Memorial Airport	Rosecrans	United States
STK	83	Sterling Municipal Airport	Sterling	United States
STL	77	St Louis Lambert International Airport	St. Louis	United States
STM	65	Maestro Wilson Fonseca Airport	Santarem	Brazil
STN	237	London Stansted Airport	London	United Kingdom
STP	77	St Paul Downtown Holman Field	St. Paul	United States
STR	219	Stuttgart Airport	Stuttgart	Germany
STS	102	Charles M. Schulz Sonoma County Airport	Santa Rosa	United States
STT	128	Cyril E. King Airport	St. Thomas	Virgin Islands
STV	150	Surat Airport	Surat	India
STW	243	Stavropol Shpakovskoye Airport	Stavropol	Russia
STX	128	Henry E Rohlsen Airport	St. Croix Island	Virgin Islands
STY	109	Nueva Hesperides International Airport	Salto	Uruguay
STZ	71	Santa Terezinha Airport	Santa Terezinha	Brazil
SUA	112	Witham Field	Stuart	United States
SUB	161	Juanda International Airport	Surabaya	Indonesia
SUF	249	Lamezia Terme Airport	Lamezia	Italy
SUG	172	Surigao Airport	Sangley Point	Philippines
SUI	190	Sukhumi Dranda Airport	Sukhumi	Georgia
SUJ	222	Satu Mare Airport	Satu Mare	Romania
SUL	165	Sui Airport	Sui	Pakistan
SUN	83	Friedman Memorial Airport	Hailey	United States
SUR	133	Summer Beaver Airport	Summer Beaver	Canada
SUS	77	Spirit of St Louis Airport	Null	United States
SUU	102	Travis Air Force Base	Fairfield	United States
SUV	279	Nausori International Airport	Nausori	Fiji
SUX	77	Sioux Gateway Col. Bud Day Field	Sioux City	United States
SUY	197	Suntar Airport	Suntar	Russia
SVA	52	Savoonga Airport	Savoonga	United States
SVB	263	Sambava Airport	Sambava	Madagascar
SVD	129	Argyle International Airport	Kingstown	Saint Vincent and the Grenadines
SVG	244	Stavanger Airport Sola	Stavanger	Norway
SVH	112	Statesville Regional Airport	Statesville	United States
SVI	69	Eduardo Falla Solano Airport	San Vincente De Caguan	Colombia
SVJ	244	Svolvær Helle Airport	Svolvær	Norway
SVL	229	Savonlinna Airport	Savonlinna	Finland
SVN	112	Hunter Army Air Field	Hunter Aaf	United States
SVO	243	Sheremetyevo International Airport	Moscow	Russia
SVP	32	Kuito Airport	Kuito	Angola
SVQ	239	Sevilla Airport	Sevilla	Spain
SVU	279	Savusavu Airport	Savusavu	Fiji
SVW	52	Sparrevohn LRRS Airport	Sparrevohn	United States
SVX	198	Koltsovo Airport	Yekaterinburg	Russia
SVZ	73	San Antonio Del Tachira Airport	San Antonio	Venezuela
SWA	186	Jieyang Chaoshan International Airport	Shantou	China
SWD	52	Seward Airport	Seward	United States
SWF	112	Stewart International Airport	Newburgh	United States
SWJ	277	Southwest Bay Airport	Malekula Island	Vanuatu
SWO	77	Stillwater Regional Airport	Stillwater	United States
SWP	50	Swakopmund Airport	Swakopmund	Namibia
SWQ	171	Sumbawa Besar Airport	Sumbawa Island	Indonesia
SWS	237	Swansea Airport	Swansea	United Kingdom
SWT	167	Strezhevoy Airport	Strezhevoy	Russia
SWU	185	Suwon Airport	Suwon	South Korea
SWX	21	Shakawe Airport	Shakawe	Botswana
SXB	245	Strasbourg Airport	Strasbourg	France
SXF	219	Berlin-Schönefeld Airport	Berlin	Germany
SXI	191	Sirri Island Airport	Siri Island	Iran
SXL	226	Sligo Airport	Sligo	Ireland
SXM	81	Princess Juliana International Airport	Philipsburg	Netherlands Antilles
SXO	71	São Félix do Araguaia Airport	Sao Felix do Araguaia	Brazil
SXQ	52	Soldotna Airport	Soldotna	United States
SXR	150	Sheikh ul Alam Airport	Srinagar	India
SXV	150	Salem Airport	Salem	India
SXX	65	São Félix do Xingu Airport	Sao Felix do Xingu	Brazil
SXZ	231	Siirt Airport	Siirt	Turkey
SYA	51	Eareckson Air Station	Shemya	United States
SYD	215	Sydney Kingsford Smith International Airport	Sydney	Australia
SYH	166	Syangboche Airport	Syangboche	Nepal
SYJ	191	Sirjan Airport	Sirjan	Iran
SYM	186	Pu'er Simao Airport	Simao	China
SYO	193	Shonai Airport	Shonai	Japan
SYP	113	Ruben Cantu Airport	Santiago	Panama
SYQ	80	Tobias Bolanos International Airport	San Jose	Costa Rica
SYR	112	Syracuse Hancock International Airport	Syracuse	United States
SYS	197	Saskylakh Airport	Saskylakh	Russia
SYT	245	Saint-Yan Airport	St.-yan	France
SYU	209	Warraber Island Airport	Sue Islet	Australia
SYW	165	Sehwan Sharif Airport	Sehwan Sharif	Pakistan
SYX	186	Sanya Phoenix International Airport	Sanya	China
SYY	237	Stornoway Airport	Stornoway	United Kingdom
SYZ	191	Shiraz Shahid Dastghaib International Airport	Shiraz	Iran
SZA	32	Soyo Airport	Soyo	Angola
SZB	168	Sultan Abdul Aziz Shah International Airport	Kuala Lumpur	Malaysia
SZF	231	Samsun Çarşamba Airport	Samsun	Turkey
SZG	258	Salzburg Airport	Salzburg	Austria
SZJ	96	Siguanea Airport	Siguanea	Cuba
SZK	23	Skukuza Airport	Skukuza	South Africa
SZL	77	Whiteman Air Force Base	Knobnoster	United States
SZR	254	Stara Zagora Airport	Stara Zagora	Bulgaria
SZS	274	Ryan's Creek Aerodrome	Stewart Island	New Zealand
SZT	107	San Cristobal de las Casas Airport	San Cristobal de las Casas	Mexico
SZV	186	Suzhou Guangfu Airport	Suzhou	China
SZW	219	Schwerin Parchim Airport	Parchim	Germany
SZX	186	Shenzhen Bao'an International Airport	Shenzhen	China
SZZ	260	Szczecin-Goleniów "Solidarność" Airport	Szczecin	Poland
TAB	117	Tobago-Crown Point Airport	Scarborough	Trinidad and Tobago
TAC	172	Daniel Z. Romualdez Airport	Tacloban	Philippines
TAE	185	Daegu Airport	Taegu	South Korea
TAF	3	Tafaraoui Airport	Oran	Algeria
TAG	172	Tagbilaran Airport	Tagbilaran	Philippines
TAH	277	Tanna Airport	Tanna	Vanuatu
TAI	139	Ta'izz International Airport	Taiz	Yemen
TAK	193	Takamatsu Airport	Takamatsu	Japan
TAM	107	General Francisco Javier Mina International Airport	Tampico	Mexico
TAO	186	Liuting Airport	Qingdao	China
TAP	107	Tapachula International Airport	Tapachula	Mexico
TAR	249	Taranto-Grottaglie "Marcello Arlotta" Airport	Grottaglie	Italy
TAS	184	Tashkent International Airport	Tashkent	Uzbekistan
TAT	220	Poprad-Tatry Airport	Poprad	Slovakia
TAY	256	Tartu Airport	Tartu	Estonia
TAZ	142	Daşoguz Airport	Dasoguz	Turkmenistan
TBB	183	Dong Tac Airport	Tuy Hoa	Vietnam
TBG	298	Tabubil Airport	Tabubil	Papua New Guinea
TBH	172	Tugdan Airport	Romblon	Philippines
TBI	111	New Bight Airport	Cat Island	Bahamas
TBJ	49	Tabarka 7 Novembre Airport	Tabarka	Tunisia
TBN	77	Waynesville-St. Robert Regional Forney field	Fort Leonardwood	United States
TBO	16	Tabora Airport	Tabora	Tanzania
TBP	101	Capitan FAP Pedro Canga Rodriguez Airport	Tumbes	Peru
TBS	190	Tbilisi International Airport	Tbilisi	Georgia
TBT	68	Tabatinga Airport	Tabatinga	Brazil
TBU	303	Fua'amotu International Airport	Tongatapu	Tonga
TBW	243	Donskoye Airport	Tambow	Russia
TBZ	191	Tabriz International Airport	Tabriz	Iran
TCA	210	Tennant Creek Airport	Tennant Creek	Australia
TCB	111	Treasure Cay Airport	Treasure Cay	Bahamas
TCC	83	Tucumcari Municipal Airport	Tucumcari	United States
TCE	222	Tulcea Airport	Tulcea	Romania
TCG	186	Tacheng Airport	Tacheng	China
TCH	30	Tchibanga Airport	Tchibanga	Gabon
TCL	77	Tuscaloosa Regional Airport	Tuscaloosa AL	United States
TCM	102	McChord Air Force Base	Tacoma	United States
TCN	107	Tehuacan Airport	Tehuacan	Mexico
TCO	69	La Florida Airport	Tumaco	Colombia
TCP	12	Taba International Airport	Taba	Egypt
TCQ	101	Coronel FAP Carlos Ciriani Santa Rosa International Airport	Tacna	Peru
TCS	83	Truth Or Consequences Municipal Airport	Truth Or Consequences	United States
TCX	191	Tabas Airport	Tabas	Iran
TCZ	186	Tengchong Tuofeng Airport	Tengchong	China
TDD	100	Teniente Av. Jorge Henrich Arauz Airport	Trinidad	Bolivia
TDG	172	Tandag Airport	Tandag	Philippines
TDJ	17	Tadjoura Airport	Tadjoura	Djibouti
TDL	70	Héroes De Malvinas Airport	Tandil	Argentina
TDR	209	Theodore Airport	Theodore	Australia
TDX	146	Trat Airport	Trat	Thailand
TEA	130	Tela Airport	Tela	Honduras
TEB	112	Teterboro Airport	Teterboro	United States
TEC	123	Telêmaco Borba Airport	Telemaco Borba	Brazil
TED	225	Thisted Airport	Thisted	Denmark
TEE	3	Cheikh Larbi Tébessi Airport	Tebessa	Algeria
TEF	214	Telfer Airport	Telfer	Australia
TEM	215	Temora Airport	Temora	Australia
TEN	186	Tongren Fenghuang Airport	Tongren	China
TEQ	231	Tekirdağ Çorlu Airport	Çorlu	Turkey
TER	200	Lajes Airport	Lajes (terceira Island)	Portugal
TET	36	Chingozi Airport	Tete	Mozambique
TEU	274	Manapouri Airport	Manapouri	New Zealand
TEX	83	Telluride Regional Airport	Telluride	United States
TEZ	150	Tezpur Airport	Tezpur	India
TFF	68	Tefé Airport	Tefe	Brazil
TFN	202	Tenerife Norte Airport	Tenerife	Spain
TFS	202	Tenerife South Airport	Tenerife	Spain
TGA	187	Tengah Air Base	Tengah	Singapore
TGD	246	Podgorica Airport	Podgorica	Montenegro
TGG	168	Sultan Mahmud Airport	Kuala Terengganu	Malaysia
TGH	277	Tongoa Airport	Tongoa Island	Vanuatu
TGI	101	Tingo Maria Airport	Tingo Maria	Peru
TGJ	294	Tiga Airport	Tiga	New Caledonia
TGK	243	Taganrog Yuzhny Airport	Taganrog	Russia
TGM	222	Transilvania Târgu Mureş International Airport	Tirgu Mures	Romania
TGO	186	Tongliao Airport	Tongliao	China
TGP	167	Podkamennaya Tunguska Airport	Bor	Russia
TGR	3	Touggourt Sidi Madhi Airport	Touggourt	Algeria
TGT	16	Tanga Airport	Tanga	Tanzania
TGU	130	Toncontín International Airport	Tegucigalpa	Honduras
TGZ	107	Angel Albino Corzo International Airport	Tuxtla Gutierrez	Mexico
THE	87	Senador Petrônio Portela Airport	Teresina	Brazil
THF	219	Berlin-Tempelhof International Airport	Berlin	Germany
THG	209	Thangool Airport	Biloela	Australia
THL	181	Tachileik Airport	Tachilek	Burma
THN	255	Trollhättan-Vänersborg Airport	Trollhattan	Sweden
THO	205	Thorshofn Airport	Thorshofn	Iceland
THQ	186	Tianshui Maijishan Airport	Tianshui	China
THR	191	Mehrabad International Airport	Teheran	Iran
THS	146	Sukhothai Airport	Sukhothai	Thailand
THU	131	Thule Air Base	Thule	Greenland
THX	167	Turukhansk Airport	Turukhansk	Russia
THZ	43	Tahoua Airport	Tahoua	Niger
TIA	257	Tirana International Airport Mother Teresa	Tirana	Albania
TID	3	Bou Chekif Airport	Tiaret	Algeria
TIE	2	Tippi Airport	Tippi	Ethiopia
TIF	182	Ta’if Regional Airport	Taif	Saudi Arabia
TIH	301	Tikehau Airport	Tikehau	French Polynesia
TII	164	Tarin Kowt Airport	Tarin Kowt	Afghanistan
TIJ	132	General Abelardo L. Rodríguez International Airport	Tijuana	Mexico
TIK	77	Tinker Air Force Base	Oklahoma City	United States
TIM	162	Moses Kilangin Airport	Timika	Indonesia
TIN	3	Tindouf Airport	Tindouf	Algeria
TIP	48	Tripoli International Airport	Tripoli	Libya
TIQ	300	Tinian International Airport	West Tinian	Northern Mariana Islands
TIR	150	Tirupati Airport	Tirupeti	India
TIU	274	Timaru Airport	Timaru	New Zealand
TIV	246	Tivat Airport	Tivat	Montenegro
TIW	102	Tacoma Narrows Airport	Tacoma	United States
TIX	112	Space Coast Regional Airport	Titusville	United States
TIY	44	Tidjikja Airport	Tidjikja	Mauritania
TIZ	298	Tari Airport	Tari	Papua New Guinea
TJA	100	Capitan Oriel Lea Plaza Airport	Tarija	Bolivia
TJG	171	Warukin Airport	Tanjung-Borneo Island	Indonesia
TJH	193	Tajima Airport	Toyooka	Japan
TJI	130	Trujillo Airport	Trujillo	Honduras
TJK	231	Tokat Airport	Tokat	Turkey
TJL	71	Plínio Alarcom Airport	Tres Lagoas	Brazil
TJM	198	Roshchino International Airport	Tyumen	Russia
TJQ	161	Buluh Tumbang (H A S Hanandjoeddin) Airport	Tanjung Pandan	Indonesia
TJS	171	Tanjung Harapan Airport	Tanjung Selor-Borneo Island	Indonesia
TJU	156	Kulob Airport	Kulyab	Tajikistan
TJV	150	Tanjore Air Force Base	Tanjore	India
TKA	52	Talkeetna Airport	Talkeetna	United States
TKC	18	Tiko Airport	Tiko	Cameroon
TKD	1	Takoradi Airport	Takoradi	Ghana
TKF	102	Truckee Tahoe Airport	Truckee	United States
TKG	161	Radin Inten II (Branti) Airport	Bandar Lampung-Sumatra Island	Indonesia
TKH	146	Takhli Airport	Nakhon Sawan	Thailand
TKJ	52	Tok Junction Airport	Tok	United States
TKK	304	Chuuk International Airport	Chuuk	Micronesia
TKN	193	Tokunoshima Airport	Tokunoshima	Japan
TKP	301	Takapoto Airport	Takapoto	French Polynesia
TKQ	16	Kigoma Airport	Kigoma	Tanzania
TKS	193	Tokushima Airport/JMSDF Air Base	Tokushima	Japan
TKT	146	Tak Airport	Tak	Thailand
TKU	229	Turku Airport	Turku	Finland
TKX	301	Takaroa Airport	Takaroa	French Polynesia
TLA	52	Teller Airport	Teller	United States
TLC	107	Licenciado Adolfo Lopez Mateos International Airport	Toluca	Mexico
TLD	21	Limpopo Valley Airport	Tuli Lodge	Botswana
TLE	263	Toliara Airport	Toliara	Madagascar
TLH	112	Tallahassee Regional Airport	Tallahassee	United States
TLJ	52	Tatalina LRRS Airport	Tatalina	United States
TLL	256	Lennart Meri Tallinn Airport	Tallinn-ulemiste International	Estonia
TLM	3	Zenata – Messali El Hadj Airport	Tlemcen	Algeria
TLN	245	Toulon-Hyères Airport	Hyeres	France
TLQ	186	Turpan Jiaohe Airport	Turpan	China
TLS	245	Toulouse-Blagnac Airport	Toulouse	France
TLU	69	Golfo de Morrosquillo Airport	Tolu	Colombia
TLV	163	Ben Gurion International Airport	Tel-aviv	Israel
TMA	112	Henry Tift Myers Airport	Tifton	United States
TMB	112	Kendall-Tamiami Executive Airport	Kendall-tamiami	United States
TMC	171	Tambolaka Airport	Waikabubak-Sumba Island	Indonesia
TME	69	Gustavo Vargas Airport	Tame	Colombia
TMG	168	Tomanggong Airport	Tomanggong	Malaysia
TMI	166	Tumling Tar Airport	Tumling Tar	Nepal
TMJ	184	Termez Airport	Termez	Uzbekistan
TML	1	Tamale Airport	Tamale	Ghana
TMM	263	Toamasina Airport	Toamasina	Madagascar
TMN	302	Tamana Island Airport	Tamana	Kiribati
TMO	73	Tumeremo Airport	Tumeremo	Venezuela
TMP	229	Tampere-Pirkkala Airport	Tampere	Finland
TMR	3	Aguenar – Hadj Bey Akhamok Airport	Tamanrasset	Algeria
TMS	47	São Tomé International Airport	Sao Tome	Sao Tome and Principe
TMT	65	Trombetas Airport	Oriximina	Brazil
TMU	80	Tambor Airport	Nicoya	Costa Rica
TMW	215	Tamworth Airport	Tamworth	Australia
TMX	3	Timimoun Airport	Timimoun	Algeria
TNA	186	Yaoqiang Airport	Jinan	China
TNC	52	Tin City Long Range Radar Station Airport	Tin City	United States
TND	96	Alberto Delgado Airport	Trinidad	Cuba
TNE	193	New Tanegashima Airport	Tanegashima	Japan
TNF	245	Toussus-le-Noble Airport	Toussous-le-noble	France
TNG	13	Ibn Batouta Airport	Tanger	Morocco
TNH	186	Tonghua Sanyuanpu Airport	Tonghua	China
TNI	150	Satna Airport	Satna	India
TNJ	161	Raja Haji Fisabilillah International Airport	Tanjung Pinang	Indonesia
TNM	137	Teniente Rodolfo Marsh Martin Base	Isla Rey Jorge	Antarctica
TNN	189	Tainan Airport	Tainan	Taiwan
TNR	263	Ivato Airport	Antananarivo	Madagascar
TNT	112	Dade Collier Training and Transition Airport	Miami	United States
TNX	177	Stung Treng Airport	Stung Treng	Cambodia
TOA	102	Zamperini Field	Torrance	United States
TOB	48	Gamal Abdel Nasser Airport	Tobruk	Libya
TOC	112	Toccoa Airport - R.G. Letourneau Field	Toccoa	United States
TOD	168	Pulau Tioman Airport	Tioman	Malaysia
TOE	49	Tozeur Nefta International Airport	Tozeur	Tunisia
TOF	167	Bogashevo Airport	Tomsk	Russia
TOG	52	Togiak Airport	Togiak Village	United States
TOH	277	Torres Airstrip	Loh/Linua	Vanuatu
TOJ	239	Torrejón Airport	Madrid	Spain
TOL	112	Toledo Express Airport	Toledo	United States
TOM	5	Timbuktu Airport	Tombouctou	Mali
TOO	80	San Vito De Java Airport	San Vito De Jaba	Costa Rica
TOP	77	Philip Billard Municipal Airport	Topeka	United States
TOS	244	Tromsø Airport,	Tromso	Norway
TOT	114	Totness Airport	Totness	Suriname
TOU	294	Touho Airport	Touho	New Caledonia
TOW	123	Toledo Airport	Toledo	Brazil
TOY	193	Toyama Airport	Toyama	Japan
TPA	112	Tampa International Airport	Tampa	United States
TPC	93	Tarapoa Airport	Tarapoa	Ecuador
TPE	189	Taiwan Taoyuan International Airport	Taipei	Taiwan
TPJ	166	Taplejung Airport	Taplejung	Nepal
TPL	77	Draughon Miller Central Texas Regional Airport	Temple	United States
TPN	93	Tiputini Airport	Tiputini	Ecuador
TPP	101	Cadete FAP Guillermo Del Castillo Paredes Airport	Tarapoto	Peru
TPQ	105	Amado Nervo National Airport	Tepic	Mexico
TPS	249	Vincenzo Florio Airport Trapani-Birgi	Trapani	Italy
TQD	143	Al Taqaddum Air Base	Al Taqaddum	Iraq
TQQ	171	Maranggo Airport	Sulawesi Tenggara	Indonesia
TRA	193	Tarama Airport	Tarama	Japan
TRC	107	Francisco Sarabia International Airport	Torreon	Mexico
TRD	244	Trondheim Airport Værnes	Trondheim	Norway
TRE	237	Tiree Airport	Tiree	United Kingdom
TRF	244	Sandefjord Airport, Torp	Sandefjord	Norway
TRG	274	Tauranga Airport	Tauranga	New Zealand
TRI	112	Tri-Cities Regional TN/VA Airport	BRISTOL	United States
TRK	171	Juwata Airport	Taraken	Indonesia
TRM	102	Jacqueline Cochran Regional Airport	Palm Springs	United States
TRN	249	Turin Airport	Torino	Italy
TRO	215	Taree Airport	Taree	Australia
TRQ	120	Tarauacá Airport	Tarauaca	Brazil
TRR	151	China Bay Airport	Trinciomalee	Sri Lanka
TRS	249	Trieste–Friuli Venezia Giulia Airport	Ronchi De Legionari	Italy
TRU	101	Capitan FAP Carlos Martinez De Pinillos International Airport	Trujillo	Peru
TRV	150	Trivandrum International Airport	Trivandrum	India
TRW	302	Bonriki International Airport	Tarawa	Kiribati
TRZ	150	Tiruchirapally Civil Airport Airport	Tiruchirappalli	India
TSA	189	Taipei Songshan Airport	Taipei	Taiwan
TSB	50	Tsumeb Airport	Tsumeb	Namibia
TSE	180	Astana International Airport	Tselinograd	Kazakhstan
TSF	249	Treviso-Sant'Angelo Airport	Treviso	Italy
TSH	33	Tshikapa Airport	Tshikapa	Congo (Kinshasa)
TSJ	193	Tsushima Airport	Tsushima	Japan
TSL	107	Tamuin Airport	Tamuin	Mexico
TSN	186	Tianjin Binhai International Airport	Tianjin	China
TSR	222	Timişoara Traian Vuia Airport	Timisoara	Romania
TST	146	Trang Airport	Trang	Thailand
TSU	302	Tabiteuea South Airport	Tabiteuea	Kiribati
TSV	209	Townsville Airport	Townsville	Australia
TSX	171	Tanjung Santan Airport	Tanjung Santan	Indonesia
TSY	161	Cibeureum Airport	Tasikmalaya	Indonesia
TTA	13	Tan Tan Airport	Tan Tan	Morocco
TTB	249	Tortolì Airport	Tortoli	Italy
TTD	102	Portland Troutdale Airport	Troutdale	United States
TTE	162	Sultan Khairun Babullah Airport	Ternate	Indonesia
TTG	57	General Enrique Mosconi Airport	Tartagal	Argentina
TTH	173	Thumrait Air Base	Thumrait	Oman
TTI	301	Tetiaroa Airport	Tetiaroa	French Polynesia
TTJ	193	Tottori Airport	Tottori	Japan
TTN	112	Trenton Mercer Airport	Trenton	United States
TTQ	80	Aerotortuguero Airport	Roxana	Costa Rica
TTR	171	Pongtiku Airport	Makale	Indonesia
TTT	189	Taitung Airport	Fengnin	Taiwan
TTU	13	Saniat R'mel Airport	Tetouan	Morocco
TUA	93	Teniente Coronel Luis a Mantilla Airport	Tulcan	Ecuador
TUB	301	Tubuai Airport	Tubuai	French Polynesia
TUC	60	Teniente Benjamin Matienzo Airport	Tucuman	Argentina
TUD	15	Tambacounda Airport	Tambacounda	Senegal
TUF	245	Tours-Val-de-Loire Airport	Tours	France
TUG	172	Tuguegarao Airport	Tuguegarao	Philippines
TUI	182	Turaif Domestic Airport	Turaif	Saudi Arabia
TUK	165	Turbat International Airport	Turbat	Pakistan
TUL	77	Tulsa International Airport	Tulsa	United States
TUN	49	Tunis Carthage International Airport	Tunis	Tunisia
TUO	274	Taupo Airport	Taupo	New Zealand
TUP	77	Tupelo Regional Airport	Tupelo	United States
TUR	65	Tucuruí Airport	Tucurui	Brazil
TUS	115	Tucson International Airport	Tucson	United States
TUU	182	Tabuk Airport	Tabuk	Saudi Arabia
TUV	73	Tucupita Airport	Tucupita	Venezuela
TVA	263	Morafenobe Airport	Morafenobe	Madagascar
TVC	112	Cherry Capital Airport	Traverse City	United States
TVF	77	Thief River Falls Regional Airport	Thief River Falls	United States
TVI	112	Thomasville Regional Airport	Thomasville	United States
TVL	102	Lake Tahoe Airport	South Lake Tahoe	United States
TVU	279	Matei Airport	Matei	Fiji
TVY	181	Dawei Airport	Dawei	Burma
TWB	209	Toowoomba Airport	Toowoomba	Australia
TWF	83	Joslin Field Magic Valley Regional Airport	Twin Falls	United States
TWT	172	Sanga Sanga Airport	Sanga Sanga	Philippines
TWU	168	Tawau Airport	Tawau	Malaysia
TWZ	274	Pukaki Airport	Pukaki	New Zealand
TXG	189	Taichung Airport	Taichung	Taiwan
TXK	77	Texarkana Regional Webb Field	Texarkana	United States
TXL	219	Berlin-Tegel Airport	Berlin	Germany
TXN	186	Tunxi International Airport	Huangshan	China
TYF	255	Torsby Airport	Torsby	Sweden
TYL	101	Capitan Montes Airport	Talara	Peru
TYM	111	Staniel Cay Airport	Staniel Cay	Bahamas
TYN	186	Taiyuan Wusu Airport	Taiyuan	China
TYR	77	Tyler Pounds Regional Airport	Tyler	United States
TYS	112	McGhee Tyson Airport	Knoxville	United States
TZL	251	Tuzla International Airport	Null	Bosnia and Herzegovina
TZR	223	Taszár Air Base	Columbus	United States
TZX	231	Trabzon International Airport	Trabzon	Turkey
UAB	231	İncirlik Air Base	Adana	Turkey
UAH	289	Ua Huka Airport	Ua Huka	French Polynesia
UAI	154	Suai Airport	Suai	East Timor
UAK	88	Narsarsuaq Airport	Narssarssuaq	Greenland
UAM	284	Andersen Air Force Base	Andersen	Guam
UAP	289	Ua Pou Airport	Ua Pou	French Polynesia
UAQ	58	Domingo Faustino Sarmiento Airport	San Juan	Argentina
UAR	13	Bouarfa Airport	Bouarfa	Morocco
UAS	41	Buffalo Spring	Samburu South	Kenya
UBA	123	Mário de Almeida Franco Airport	Uberaba	Brazil
UBB	209	Mabuiag Island Airport	Mabuiag Island	Australia
UBJ	193	Yamaguchi Ube Airport	Yamaguchi	Japan
UBP	146	Ubon Ratchathani Airport	Ubon Ratchathani	Thailand
UCK	234	Lutsk Airport	Lutsk	Ukraine
UCT	243	Ukhta Airport	Ukhta	Russia
UDD	102	Bermuda Dunes Airport	Palm Springs	United States
UDI	123	Ten. Cel. Aviador César Bombonato Airport	Uberlandia	Brazil
UDJ	234	Uzhhorod International Airport	Uzhgorod	Ukraine
UDR	150	Maharana Pratap Airport	Udaipur	India
UEL	36	Quelimane Airport	Quelimane	Mozambique
UEO	193	Kumejima Airport	Kumejima	Japan
UET	165	Quetta International Airport	Quetta	Pakistan
UFA	198	Ufa International Airport	Ufa	Russia
UGA	194	Bulgan Airport	Bulgan	Mongolia
UGC	184	Urgench Airport	Urgench	Uzbekistan
UGN	77	Waukegan National Airport	Chicago	United States
UGO	32	Uige Airport	Uige	Angola
UHE	247	Kunovice Airport	Kunovice	Czech Republic
UIB	69	El Caraño Airport	Quibdo	Colombia
UIH	183	Phu Cat Airport	Phucat	Vietnam
UII	130	Utila Airport	Utila	Honduras
UIK	160	Ust-Ilimsk Airport	Ust Ilimsk	Russia
UIN	77	Quincy Regional Baldwin Field	Quincy	United States
UIO	93	Mariscal Sucre International Airport	Quito	Ecuador
UIP	245	Quimper-Cornouaille Airport	Quimper	France
UJE	288	Ujae Atoll Airport	Ujae Atoll	Marshall Islands
UKA	41	Ukunda Airstrip	Ukunda	Kenya
UKB	193	Kobe Airport	Kobe	Japan
UKK	180	Ust-Kamennogorsk Airport	Ust Kamenogorsk	Kazakhstan
UKS	252	Belbek Airport	Sevastopol	Ukraine
UKX	160	Ust-Kut Airport	Ust-Kut	Russia
ULA	56	Capitan D Daniel Vazquez Airport	San Julian	Argentina
ULB	277	Uléi Airport	Ambryn Island	Vanuatu
ULD	23	Prince Mangosuthu Buthelezi Airport	Ulundi	South Africa
ULG	159	Ulgii Mongolei Airport	Olgii	Mongolia
ULH	182	Majeed Bin Abdulaziz Airport	Al-Ula	Saudi Arabia
ULK	197	Lensk Airport	Lensk	Russia
ULN	194	Chinggis Khaan International Airport	Ulan Bator	Mongolia
ULO	159	Ulaangom Airport	Ulaangom	Mongolia
ULP	209	Quilpie Airport	Quilpie	Australia
ULQ	69	Heriberto Gíl Martínez Airport	Tulua	Colombia
ULU	25	Gulu Airport	Gulu	Uganda
ULV	250	Ulyanovsk Baratayevka Airport	Ulyanovsk	Russia
ULY	250	Ulyanovsk East Airport	Ulyanovsk	Russia
ULZ	194	Donoi Airport	Uliastai	Mongolia
UMD	88	Uummannaq Heliport	Uummannaq	Greenland
UME	255	Umeå Airport	Umea	Sweden
UMR	208	Woomera Airfield	Woomera	Australia
UMS	197	Ust-Maya Airport	Ust-Maya	Russia
UMU	123	Umuarama Airport	Umuarama	Brazil
UNA	87	Hotel Transamérica Airport	Una	Brazil
UND	164	Konduz Airport	Kunduz	Afghanistan
UNG	298	Kiunga Airport	Kiunga	Papua New Guinea
UNI	129	Union Island International Airport	Union Island	Saint Vincent and the Grenadines
UNK	52	Unalakleet Airport	Unalakleet	United States
UNN	146	Ranong Airport	Ranong	Thailand
UNT	237	Unst Airport	Unst	United Kingdom
UOS	77	Franklin County Airport	Sewanee	United States
UPB	96	Playa Baracoa Airport	Baracoa Playa	Cuba
UPG	171	Hasanuddin International Airport	Ujung Pandang	Indonesia
UPN	107	Licenciado y General Ignacio Lopez Rayon Airport	Uruapan	Mexico
UPP	285	Upolu Airport	Opolu	United States
URA	176	Uralsk Airport	Uralsk	Kazakhstan
URC	186	Ürümqi Diwopu International Airport	Urumqi	China
URD	219	Burg Feuerstein Airport	Burg Feuerstein	Germany
URE	256	Kuressaare Airport	Kuressaare	Estonia
URG	123	Rubem Berta Airport	Uruguaiana	Brazil
URJ	198	Uray Airport	Uraj	Russia
URO	245	Rouen Airport	Rouen	France
URS	243	Kursk East Airport	Kursk	Russia
URT	146	Surat Thani Airport	Surat Thani	Thailand
URY	182	Gurayat Domestic Airport	Guriat	Saudi Arabia
USA	112	Concord-Padgett Regional Airport	Concord	United States
USH	61	Malvinas Argentinas Airport	Ushuaia	Argentina
USI	94	Mabaruma Airport	Mabaruma	Guyana
USK	243	Usinsk Airport	Usinsk	Russia
USM	146	Samui Airport	Ko Samui	Thailand
USN	185	Ulsan Airport	Ulsan	South Korea
USQ	231	Uşak Airport	Usak	Turkey
USR	196	Ust-Nera Airport	Ust-Nera	Russia
USS	96	Sancti Spiritus Airport	Sancti Spiritus	Cuba
UST	112	Northeast Florida Regional Airport	St. Augustine Airport	United States
USU	172	Francisco B. Reyes Airport	Busuanga	Philippines
UTA	22	Mutare Airport	Mutare	Zimbabwe
UTC	216	Soesterberg Air Base	Soesterberg	Netherlands
UTH	146	Udon Thani Airport	Udon Thani	Thailand
UTI	229	Utti Air Base	Utti	Finland
UTK	288	Utirik Airport	Utirik Island	Marshall Islands
UTM	77	Tunica Municipal Airport	Tunica	United States
UTN	23	Pierre Van Ryneveld Airport	Upington	South Africa
UTO	52	Indian Mountain LRRS Airport	Indian Mountains	United States
UTP	146	U-Tapao International Airport	Pattaya	Thailand
UTS	243	Ust-Tsylma Airport	Ust-Tsylma	Russia
UTT	23	K. D. Matanzima Airport	Umtata	South Africa
UTW	23	Queenstown Airport	Queenstown	South Africa
UUA	243	Bugulma Airport	Bugulma	Russia
UUD	160	Ulan-Ude Airport (Mukhino)	Ulan-ude	Russia
UUK	52	Ugnu-Kuparuk Airport	Kuparuk	United States
UUS	188	Yuzhno-Sakhalinsk Airport	Yuzhno-sakhalinsk	Russia
UVA	77	Garner Field	Uvalde	United States
UVE	294	Ouvéa Airport	Ouvea	New Caledonia
UVF	127	Hewanorra International Airport	Hewandorra	Saint Lucia
UYL	26	Nyala Airport	Nyala	Sudan
UYN	186	Yulin Yuyang Airport	Yulin	China
UYU	100	Uyuni Airport	Uyuni	Bolivia
UZU	79	Curuzu Cuatia Airport	Curuzu Cuatia	Argentina
VAA	229	Vaasa Airport	Vaasa	Finland
VAD	112	Moody Air Force Base	Valdosta	United States
VAF	245	Valence-Chabeuil Airport	Valence	France
VAG	123	Major Brigadeiro Trompowsky Airport	Varginha	Brazil
VAI	298	Vanimo Airport	Vanimo	Papua New Guinea
VAK	52	Chevak Airport	Chevak	United States
VAL	87	Valença Airport	Valenca	Brazil
VAM	269	Villa Airport	Maamigili	Maldives
VAN	231	Van Ferit Melen Airport	Van	Turkey
VAO	283	Suavanao Airport	Suavanao	Solomon Islands
VAR	254	Varna Airport	Varna	Bulgaria
VAS	231	Sivas Nuri Demirağ Airport	Sivas	Turkey
VAV	303	Vava'u International Airport	Vava'u	Tonga
VAW	244	Vardø Airport, Svartnes	Vardø	Norway
VBA	181	Ann Airport	Ann	Burma
VBG	102	Vandenberg Air Force Base	Lompoc	United States
VBP	181	Bokpyinn Airport	Bokepyin	Burma
VBS	249	Brescia Airport	Brescia	Italy
VBV	279	Vanua Balavu Airport	Vanua Balavu	Fiji
VBY	255	Visby Airport	Visby	Sweden
VCA	183	Can Tho International Airport	Can Tho	Vietnam
VCD	210	Victoria River Downs Airport	Victoria River Downs	Australia
VCE	249	Venice Marco Polo Airport	Venice	Italy
VCL	183	Chu Lai International Airport	Chu Lai	Vietnam
VCP	123	Viracopos International Airport	Campinas	Brazil
VCR	73	Carora Airport	Carora	Venezuela
VCS	183	Co Ong Airport	Conson	Vietnam
VCT	77	Victoria Regional Airport	Victoria	United States
VCV	102	Southern California Logistics Airport	Victorville	United States
VDA	163	Ovda International Airport	Ovda	Israel
VDB	244	Leirin Airport	Fagernes	Norway
VDC	87	Vitória da Conquista Airport	Vitória Da Conquista	Brazil
VDE	202	Hierro Airport	Hierro	Spain
VDH	183	Dong Hoi Airport	Dong Hoi	Vietnam
VDM	57	Gobernador Castello Airport	Viedma	Argentina
VDP	73	Valle de La Pascua Airport	Valle De La Pascua	Venezuela
VDR	79	Villa Dolores Airport	Villa Dolores	Argentina
VDS	244	Vadsø Airport	Vadsø	Norway
VDZ	52	Valdez Pioneer Field	Valdez	United States
VEE	52	Venetie Airport	Venetie	United States
VEL	83	Vernal Regional Airport	Vernal	United States
VER	107	General Heriberto Jara International Airport	Vera Cruz	Mexico
VEY	205	Vestmannaeyjar Airport	Vestmannaeyjar	Iceland
VFA	22	Victoria Falls International Airport	Victoria Falls	Zimbabwe
VGA	150	Vijayawada Airport	Vijayawada	India
VGD	243	Vologda Airport	Vologda	Russia
VGO	239	Vigo Airport	Vigo	Spain
VGT	102	North Las Vegas Airport	Las Vegas	United States
VGZ	69	Villa Garzón Airport	Villa Garzon	Colombia
VHC	32	Saurimo Airport	Saurimo	Angola
VHM	255	Vilhelmina Airport	Vilhelmina	Sweden
VHY	245	Vichy-Charmeil Airport	Vichy	France
VIC	249	Vicenza Airport	Vicenza	Italy
VIE	258	Vienna International Airport	Vienna	Austria
VIG	73	Juan Pablo Pérez Alfonso Airport	El Vigía	Venezuela
VII	183	Vinh Airport	Vinh	Vietnam
VIJ	134	Virgin Gorda Airport	Spanish Town	British Virgin Islands
VIL	19	Dakhla Airport	Dakhla	Western Sahara
VIN	234	Vinnytsia/Gavyryshivka Airport	Vinnitsa	Ukraine
VIR	23	Virginia Airport	Durban	South Africa
VIS	102	Visalia Municipal Airport	Visalia	United States
VIT	239	Vitoria/Foronda Airport	Vitoria	Spain
VIX	123	Eurico de Aguiar Salles Airport	Vitoria	Brazil
VIY	245	Villacoublay-Vélizy (BA 107) Air Base	Villacoublay	France
VKG	183	Rach Gia Airport	Rach Gia	Vietnam
VKO	243	Vnukovo International Airport	Moscow	Russia
VKT	243	Vorkuta Airport	Vorkuta	Russia
VLC	239	Valencia Airport	Valencia	Spain
VLD	112	Valdosta Regional Airport	Valdosta	United States
VLG	70	Villa Gesell Airport	Villa Gesell	Argentina
VLI	277	Bauerfield International Airport	Port-vila	Vanuatu
VLL	239	Valladolid Airport	Valladolid	Spain
VLM	100	Teniente Coronel Rafael Pabón Airport	Villa Montes	Bolivia
VLN	73	Arturo Michelena International Airport	Valencia	Venezuela
VLR	121	Vallenar Airport	Vallenar	Chile
VLS	277	Valesdir Airport	Valesdir	Vanuatu
VLU	243	Velikiye Luki Airport	Velikiye Luki	Russia
VLV	73	Dr. Antonio Nicolás Briceño Airport	Valera	Venezuela
VLY	237	Anglesey Airport	Angelsey	United Kingdom
VME	59	Villa Reynolds Airport	Villa Reynolds	Argentina
VMU	298	Baimuru Airport	Baimuru	Papua New Guinea
VNA	195	Saravane Airport	Saravane	Laos
VNC	112	Venice Municipal Airport	Venice	United States
VNE	245	Vannes-Meucon Airport	Vannes	France
VNO	259	Vilnius International Airport	Vilnius	Lithuania
VNS	150	Lal Bahadur Shastri Airport	Varanasi	India
VNT	248	Ventspils International Airport	Ventspils	Latvia
VNX	36	Vilankulo Airport	Vilankulu	Mozambique
VNY	102	Van Nuys Airport	Van Nuys	United States
VOD	247	Vodochody Airport	Vodochody	Czech Republic
VOG	243	Volgograd International Airport	Volgograd	Russia
VOH	263	Vohimarina Airport	Vohemar	Madagascar
VOK	77	Volk Field	Camp Douglas	United States
VOL	217	Nea Anchialos Airport	Nea Anghialos	Greece
VOZ	243	Voronezh International Airport	Voronezh	Russia
VPE	32	Ngjiva Pereira Airport	Ondjiva	Angola
VPN	205	Vopnafjörður Airport	Vopnafjörður	Iceland
VPS	77	Destin-Ft Walton Beach Airport	Valparaiso	United States
VPY	36	Chimoio Airport	Chimoio	Mozambique
VQQ	112	Cecil Airport	Jacksonville	United States
VQS	118	Vieques Airport	Vieques Island	Puerto Rico
VRA	96	Juan Gualberto Gomez International Airport	Varadero	Cuba
VRB	112	Vero Beach Regional Airport	Vero Beach	United States
VRC	172	Virac Airport	Virac	Philippines
VRE	23	Vredendal Airport	Vredendal	South Africa
VRK	229	Varkaus Airport	Varkaus	Finland
VRL	235	Vila Real Airport	Vila Real	Portugal
VRN	249	Verona Villafranca Airport	Villafranca	Italy
VRO	96	Kawama Airport	Kawama	Cuba
VRU	23	Vryburg Airport	Vryburg	South Africa
VRY	244	Værøy Heliport	Værøy	Norway
VSA	107	Carlos Rovirosa Pérez International Airport	Villahermosa	Mexico
VSE	235	Aerodromo Goncalves Lobato (Viseu Airport)	Viseu	Portugal
VSG	234	Luhansk International Airport	Lugansk	Ukraine
VST	255	Stockholm Västerås Airport	Vasteras	Sweden
VTB	242	Vitebsk Vostochny Airport	Vitebsk	Belarus
VTE	195	Wattay International Airport	Vientiane	Laos
VTM	163	Nevatim Air Base	Nevatim	Israel
VTU	96	Hermanos Ameijeiras Airport	Las Tunas	Cuba
VTZ	150	Vishakhapatnam Airport	Vishakhapatnam	India
VUP	69	Alfonso López Pumarejo Airport	Valledupar	Colombia
VUS	243	Velikiy Ustyug Airport	Veliky Ustyug	Russia
VVC	69	Vanguardia Airport	Villavicencio	Colombia
VVI	100	Viru Viru International Airport	Santa Cruz	Bolivia
VVO	196	Vladivostok International Airport	Vladivostok	Russia
VVZ	3	Illizi Takhamalt Airport	Illizi	Algeria
VXC	36	Lichinga Airport	Lichinga	Mozambique
VXE	203	São Pedro Airport	Sao Vicente Island	Cape Verde
VXO	255	Växjö Kronoberg Airport	Vaxjo	Sweden
VYS	77	Illinois Valley Regional Airport-Walter A Duncan Field	Peru	United States
WAA	52	Wales Airport	Wales	United States
WAE	182	Wadi Al Dawasir Airport	Wadi-al-dawasir	Saudi Arabia
WAF	165	Wana Airport	Wana	Pakistan
WAG	274	Wanganui Airport	Wanganui	New Zealand
WAI	263	Ambalabe Airport	Antsohihy	Madagascar
WAL	112	Wallops Flight Facility Airport	Wallops Island	United States
WAM	263	Ambatondrazaka Airport	Ambatondrazaka	Madagascar
WAQ	263	Antsalova Airport	Antsalova	Madagascar
WAR	162	Waris Airport	Waris-Papua Island	Indonesia
WAT	226	Waterford Airport	Waterford	Ireland
WAW	260	Warsaw Chopin Airport	Warsaw	Poland
WBG	219	Schleswig Air Base	Schleswig	Germany
WBM	298	Wapenamanda Airport	Wapenamanda	Papua New Guinea
WBQ	52	Beaver Airport	Beaver	United States
WBU	83	Boulder Municipal Airport	Boulder	United States
WBW	112	Wilkes Barre Wyoming Valley Airport	Wilkes-Barre	United States
WCH	121	Chaitén Airport	Chaiten	Chile
WDH	50	Hosea Kutako International Airport	Windhoek	Namibia
WDR	112	Barrow County Airport	Winder	United States
WEF	186	Weifang Airport	Weifang	China
WEH	186	Weihai Airport	Weihai	China
WEI	209	Weipa Airport	Weipa	Australia
WFI	263	Fianarantsoa Airport	Fianarantsoa	Madagascar
WFK	112	Northern Aroostook Regional Airport	Frenchville	United States
WGA	215	Wagga Wagga City Airport	Wagga Wagga	Australia
WGE	215	Walgett Airport	Walgett	Australia
WGP	171	Umbu Mehang Kunda Airport	Waingapu	Indonesia
WHF	26	Wadi Halfa Airport	Wadi Halfa	Sudan
WHK	274	Whakatane Airport	Whakatane	New Zealand
WHP	102	Whiteman Airport	Los Angeles	United States
WIC	237	Wick Airport	Wick	United Kingdom
WIE	219	Wiesbaden Army Airfield	Wiesbaden	Germany
WIL	41	Nairobi Wilson Airport	Nairobi	Kenya
WIN	209	Winton Airport	Winton	Australia
WIO	215	Wilcannia Airport	Wilcannia	Australia
WIR	274	Wairoa Airport	Wairoa	New Zealand
WJR	41	Wajir Airport	Wajir	Kenya
WJU	185	Wonju/Hoengseong Air Base (K-38/K-46)	Wonju	South Korea
WKA	274	Wanaka Airport	Wanaka	New Zealand
WKF	23	Waterkloof Air Force Base	Waterkloof	South Africa
WKJ	193	Wakkanai Airport	Wakkanai	Japan
WKK	52	Aleknagik / New Airport	Aleknagik	United States
WKL	285	Waikoloa Heliport	Waikoloa Village	United States
WLD	77	Strother Field	Winfield	United States
WLG	274	Wellington International Airport	Wellington	New Zealand
WLH	277	Walaha Airport	Walaha	Vanuatu
WLK	52	Selawik Airport	Selawik	United States
WLS	305	Hihifo Airport	Wallis	Wallis and Futuna
WMA	263	Mandritsara Airport	Mandritsara	Madagascar
WME	214	Mount Keith Airport	Mount Keith	Australia
WMI	260	Modlin Airport	Warsaw	Poland
WMN	263	Maroantsetra Airport	Maroantsetra	Madagascar
WMO	52	White Mountain Airport	White Mountain	United States
WMP	263	Mampikony Airport	Mampikony	Madagascar
WMR	263	Mananara Nord Airport	Mananara	Madagascar
WMX	162	Wamena Airport	Wamena	Indonesia
WNA	52	Napakiak Airport	Napakiak	United States
WNN	133	Wunnumin Lake Airport	Wunnumin Lake	Canada
WNP	172	Naga Airport	Naga	Philippines
WNR	209	Windorah Airport	Windorah	Australia
WNS	165	Shaheed Benazirabad Airport	Nawabshah	Pakistan
WNZ	186	Wenzhou Longwan International Airport	Wenzhou	China
WOE	216	Woensdrecht Air Base	Woensdrecht	Netherlands
WOL	215	Wollongong Airport	Wollongong	Australia
WOT	189	Wang-an Airport	Wang An	Taiwan
WPB	263	Port Bergé Airport	Port Bergé	Madagascar
WPR	121	Capitan Fuentes Martinez Airport Airport	Porvenir	Chile
WPU	121	Guardiamarina Zañartu Airport	Puerto Williams	Chile
WRB	112	Robins Air Force Base	Macon	United States
WRE	274	Whangarei Airport	Whangarei	New Zealand
WRG	52	Wrangell Airport	Wrangell	United States
WRI	112	Mc Guire Air Force Base	Wrightstown	United States
WRL	83	Worland Municipal Airport	Worland	United States
WRO	260	Copernicus Wrocław Airport	Wroclaw	Poland
WRT	237	Warton Airport	Warton	United Kingdom
WRY	237	Westray Airport	Westray	United Kingdom
WRZ	151	Weerawila Airport	Wirawila	Sri Lanka
WSD	83	Condron Army Air Field	White Sands	United States
WSN	52	South Naknek Nr 2 Airport	South Naknek	United States
WSO	114	Washabo Airport	Washabo	Suriname
WSP	103	Waspam Airport	Waspam	Nicaragua
WSR	162	Wasior Airport	Wasior	Indonesia
WST	112	Westerly State Airport	Washington County	United States
WSY	209	Whitsunday Island Airport	Airlie Beach	Australia
WSZ	274	Westport Airport	Westport	New Zealand
WTA	263	Tambohorano Airport	Tambohorano	Madagascar
WTB	209	Toowoomba Wellcamp Airport	Toowoomba	Australia
WTK	52	Noatak Airport	Noatak	United States
WTN	237	RAF Waddington	Waddington	United Kingdom
WTS	263	Tsiroanomandidy Airport	Tsiroanomandidy	Madagascar
WTZ	274	Whitianga Airport	Whitianga	New Zealand
WUA	186	Wuhai Airport	Wuhai	China
WUH	186	Wuhan Tianhe International Airport	Wuhan	China
WUN	214	Wiluna Airport	Wiluna	Australia
WUS	186	Nanping Wuyishan Airport	Wuyishan	China
WUU	24	Wau Airport	Wau	Sudan
WUX	186	Sunan Shuofang International Airport	Wuxi	China
WUZ	186	Wuzhou Changzhoudao Airport	Wuzhou	China
WVB	50	Walvis Bay Airport	Walvis Bay	Namibia
WVK	263	Manakara Airport	Manakara	Madagascar
WVN	219	Wilhelmshaven-Mariensiel Airport	Wilhelmshaven	Germany
WWD	112	Cape May County Airport	Wildwood	United States
WWK	298	Wewak International Airport	Wewak	Papua New Guinea
WXN	186	Wanxian Airport	Wanxian	China
WYA	208	Whyalla Airport	Whyalla	Australia
WYE	20	Yengema Airport	Yengema	Sierra Leone
WYN	214	Wyndham Airport	Wyndham	Australia
WYS	83	Yellowstone Airport	West Yellowstone	United States
XAB	245	Abbeville	Abbeville	France
XAP	123	Serafin Enoss Bertaso Airport	Chapeco	Brazil
XAU	75	Saúl Airport	Saul	French Guiana
XBE	136	Bearskin Lake Airport	Bearskin Lake	Canada
XBJ	191	Birjand Airport	Birjand	Iran
XCH	265	Christmas Island Airport	Christmas Island	Christmas Island
XCR	245	Châlons-Vatry Airport	Chalons	France
XCZ	245	Charleville-Mézières Airport	Charleville	France
XFN	186	Xiangyang Liuji Airport	Xiangfan	China
XFW	219	Hamburg-Finkenwerder Airport	Hamburg	Germany
XGN	32	Xangongo Airport	Xangongo	Angola
XGR	133	Kangiqsualujjuaq (Georges River) Airport	Kangiqsualujjuaq	Canada
XIC	186	Xichang Qingshan Airport	Xichang	China
XIL	186	Xilinhot Airport	Xilinhot	China
XIY	186	Xi'an Xianyang International Airport	Xi'an	China
XJD	179	Al Udeid Air Base	Doha	Qatar
XJM	165	Mangla Airport	Mangla	Pakistan
XKH	195	Xieng Khouang Airport	Phon Savan	Laos
XKS	133	Kasabonika Airport	Kasabonika	Canada
XLB	136	Lac Brochet Airport	Lac Brochet	Canada
XLS	15	Saint Louis Airport	St. Louis	Senegal
XMC	211	Mallacoota Airport	Mallacoota	Australia
XME	245	Maubeuge-Élesmes Airport	Maubeuge	France
XMH	301	Manihi Airport	Manihi	French Polynesia
XMN	186	Xiamen Gaoqi International Airport	Xiamen	China
XMS	93	Coronel E Carvajal Airport	Macas	Ecuador
XMW	245	Montauban Airport	Montauban	France
XMY	209	Yam Island Airport	Yam Island	Australia
XNA	77	Northwest Arkansas Regional Airport	Bentonville	United States
XNN	186	Xining Caojiabu Airport	Xining	China
XOG	245	Orange-Caritat (BA 115) Air Base	Orange	France
XQC	143	Joint Base Balad	Al Bakr	Iraq
XQP	80	Quepos Managua Airport	Quepos	Costa Rica
XRH	215	RAAF Base Richmond	Richmond	Australia
XRY	239	Jerez Airport	Jerez	Spain
XSB	155	Sir Bani Yas Airport	Sir Bani Yas Island	United Arab Emirates
XSC	89	South Caicos Airport	South Caicos	Turks and Caicos Islands
XSD	102	Tonopah Test Range Airport	Tonopah	United States
XSI	136	South Indian Lake Airport	South Indian Lake	Canada
XSP	187	Seletar Airport	Singapore	Singapore
XTG	209	Thargomindah Airport	Thargomindah	Australia
XTL	136	Tadoule Lake Airport	Tadoule Lake	Canada
XUZ	186	Xuzhou Guanyin Airport	Xuzhou	China
XVS	245	Valenciennes-Denain Airport	Valenciennes	France
XYA	283	Yandina Airport	Yandina	Solomon Islands
XYE	181	Ye Airport	Ye	Burma
YAA	135	Anahim Lake Airport	Anahim Lake	Canada
YAB	136	Old Arctic Bay Airport	Arctic Bay	Canada
YAC	136	Cat Lake Airport	Cat Lake	Canada
YAG	136	Fort Frances Municipal Airport	Fort Frances	Canada
YAI	121	Gral. Bernardo O´Higgins Airport	Chillan	Chile
YAK	52	Yakutat Airport	Yakutat	United States
YAM	133	Sault Ste Marie Airport	Sault Sainte Marie	Canada
YAO	18	Yaoundé Airport	Yaounde	Cameroon
YAP	304	Yap International Airport	Yap	Micronesia
YAT	133	Attawapiskat Airport	Attawapiskat	Canada
YAX	136	Wapekeka Airport	Angling Lake	Canada
YAY	125	St. Anthony Airport	St. Anthony	Canada
YAZ	135	Tofino / Long Beach Airport	Tofino	Canada
YBB	85	Kugaaruk Airport	Pelly Bay	Canada
YBC	133	Baie Comeau Airport	Baie Comeau	Canada
YBE	119	Uranium City Airport	Uranium City	Canada
YBG	133	CFB Bagotville	Bagotville	Canada
YBI	95	Black Tickle Airport	Black Tickle	Canada
YBK	136	Baker Lake Airport	Baker Lake	Canada
YBL	135	Campbell River Airport	Campbell River	Canada
YBO	135	Bob Quinn Lake Airport	Bob Quinn Lake	Canada
YBP	186	Yibin Caiba Airport	Yibin	China
YBR	136	Brandon Municipal Airport	Brandon	Canada
YBT	136	Brochet Airport	Brochet	Canada
YBV	136	Berens River Airport	Berens River	Canada
YBW	135	Bedwell Harbour Seaplane Base	Bedwell Harbour	Canada
YBX	67	Lourdes de Blanc Sablon Airport	Lourdes-De-Blanc-Sablon	Canada
YBY	85	Bonnyville Airport	Bonnyville	Canada
YCB	85	Cambridge Bay Airport	Cambridge Bay	Canada
YCC	133	Cornwall Regional Airport	Cornwall	Canada
YCD	135	Nanaimo Airport	Nanaimo	Canada
YCG	135	Castlegar/West Kootenay Regional Airport	Castlegar	Canada
YCH	95	Miramichi Airport	Chatham	Canada
YCK	85	Colville Lake Airport	Colville Lake	Canada
YCL	95	Charlo Airport	Charlo	Canada
YCM	133	Niagara District Airport	Saint Catherines	Canada
YCN	133	Cochrane Airport	Cochrane	Canada
YCO	85	Kugluktuk Airport	Coppermine	Canada
YCR	136	Cross Lake (Charlie Sinclair Memorial) Airport	Cross Lake	Canada
YCS	136	Chesterfield Inlet Airport	Chesterfield Inlet	Canada
YCT	85	Coronation Airport	Coronation	Canada
YCU	186	Yuncheng Guangong Airport	Yuncheng	China
YCW	135	Chilliwack Airport	Chilliwack	Canada
YCY	133	Clyde River Airport	Clyde River	Canada
YDA	135	Dawson City Airport	Dawson	Canada
YDB	135	Burwash Airport	Burwash	Canada
YDF	125	Deer Lake Airport	Deer Lake	Canada
YDL	135	Dease Lake Airport	Dease Lake	Canada
YDN	136	Dauphin Barker Airport	Dauphin	Canada
YDP	95	Nain Airport	Nain	Canada
YDQ	82	Dawson Creek Airport	Dawson Creek	Canada
YDT	135	Boundary Bay Airport	Boundary Bay	Canada
YEC	185	Yecheon Airbase	Yechon	South Korea
YEG	85	Edmonton International Airport	Edmonton	Canada
YEI	231	Bursa Yenişehir Airport	Yenisehir	Turkey
YEK	136	Arviat Airport	Eskimo Point	Canada
YEL	133	Elliot Lake Municipal Airport	ELLIOT LAKE	Canada
YEM	133	Manitoulin East Municipal Airport	Manitowaning	Canada
YEN	119	Estevan Airport	Estevan	Canada
YEO	237	RNAS Yeovilton	Yeovilton	United Kingdom
YER	133	Fort Severn Airport	Fort Severn	Canada
YES	191	Yasouj Airport	Yasuj	Iran
YET	85	Edson Airport	Edson	Canada
YEU	136	Eureka Airport	Eureka	Canada
YEV	85	Inuvik Mike Zubko Airport	Inuvik	Canada
YFA	133	Fort Albany Airport	Fort Albany	Canada
YFB	133	Iqaluit Airport	Iqaluit	Canada
YFC	95	Fredericton Airport	Fredericton	Canada
YFE	133	Forestville Airport	Forestville	Canada
YFH	133	Fort Hope Airport	Fort Hope	Canada
YFJ	85	Wekweètì Airport	Wekweeti	Canada
YFO	136	Flin Flon Airport	Flin Flon	Canada
YFR	85	Fort Resolution Airport	Fort Resolution	Canada
YFS	85	Fort Simpson Airport	Fort Simpson	Canada
YFX	125	St. Lewis (Fox Harbour) Airport	St. Lewis	Canada
YGB	135	Texada Gillies Bay Airport	Texada	Canada
YGG	135	Ganges Seaplane Base	Ganges	Canada
YGH	85	Fort Good Hope Airport	Fort Good Hope	Canada
YGJ	193	Miho Yonago Airport	Miho	Japan
YGK	133	Kingston Norman Rogers Airport	Kingston	Canada
YGL	133	La Grande Rivière Airport	La Grande Riviere	Canada
YGM	136	Gimli Industrial Park Airport	Gimli	Canada
YGO	136	Gods Lake Narrows Airport	Gods Lake Narrows	Canada
YGP	133	Gaspé (Michel-Pouliot) Airport	Gaspe	Canada
YGQ	133	Geraldton Greenstone Regional Airport	Geraldton	Canada
YGR	133	Îles-de-la-Madeleine Airport	Iles De La Madeleine	Canada
YGT	133	Igloolik Airport	Igloolik	Canada
YGV	133	Havre St Pierre Airport	Havre-Saint-Pierre	Canada
YGW	133	Kuujjuarapik Airport	Kuujjuarapik	Canada
YGX	136	Gillam Airport	Gillam	Canada
YGZ	133	Grise Fiord Airport	Grise Fiord	Canada
YHA	125	Port Hope Simpson Airport	Port Hope Simpson	Canada
YHB	119	Hudson Bay Airport	Hudson Bay	Canada
YHD	136	Dryden Regional Airport	Dryden	Canada
YHF	133	Hearst René Fontaine Municipal Airport	Hearst	Canada
YHI	85	Ulukhaktok Holman Airport	Holman Island	Canada
YHK	85	Gjoa Haven Airport	Gjoa Haven	Canada
YHM	133	John C. Munro Hamilton International Airport	Hamilton	Canada
YHN	133	Hornepayne Municipal Airport	Hornepayne	Canada
YHO	95	Hopedale Airport	Hopedale	Canada
YHP	136	Poplar Hill Airport	Poplar Hill	Canada
YHR	67	Chevery Airport	Chevery	Canada
YHU	133	Montréal / Saint-Hubert Airport	Montreal	Canada
YHY	85	Hay River / Merlyn Carter Airport	Hay River	Canada
YHZ	95	Halifax / Stanfield International Airport	Halifax	Canada
YIB	78	Atikokan Municipal Airport	Atikokan	Canada
YIC	186	Yichun Mingyueshan Airport	Yichun	China
YIF	67	St Augustin Airport	St-Augustin	Canada
YIH	186	Yichang Sanxia Airport	Yichang	China
YIK	133	Ivujivik Airport	Ivujivik	Canada
YIN	186	Yining Airport	Yining	China
YIO	133	Pond Inlet Airport	Pond Inlet	Canada
YIP	112	Willow Run Airport	Detroit	United States
YIV	136	Island Lake Airport	Island Lake	Canada
YIW	186	Yiwu Airport	Yiwu	China
YJN	133	St Jean Airport	St. Jean	Canada
YJT	125	Stephenville Airport	Stephenville	Canada
YKA	135	Kamloops Airport	Kamloops	Canada
YKF	133	Waterloo Airport	Waterloo	Canada
YKG	133	Kangirsuk Airport	Kangirsuk	Canada
YKL	133	Schefferville Airport	Schefferville	Canada
YKM	102	Yakima Air Terminal McAllister Field	Yakima	United States
YKN	77	Chan Gurney Municipal Airport	Yankton	United States
YKQ	133	Waskaganish Airport	Waskaganish	Canada
YKS	197	Yakutsk Airport	Yakutsk	Russia
YKU	133	Chisasibi Airport	Chisasibi	Canada
YKX	133	Kirkland Lake Airport	Kirkland Lake	Canada
YKY	119	Kindersley Airport	Kindersley	Canada
YKZ	133	Buttonville Municipal Airport	Toronto	Canada
YLC	133	Kimmirut Airport	Kimmirut	Canada
YLD	133	Chapleau Airport	Chapleau	Canada
YLE	85	Whatì Airport	Whatì	Canada
YLH	133	Lansdowne House Airport	Lansdowne House	Canada
YLI	229	Ylivieska Airfield	Ylivieska-raudaskyla	Finland
YLJ	119	Meadow Lake Airport	Meadow Lake	Canada
YLK	133	Barrie-Orillia (Lake Simcoe Regional Airport)	Barrie-Orillia	Canada
YLL	85	Lloydminster Airport	Lloydminster	Canada
YLT	133	Alert Airport	Alert	Canada
YLW	135	Kelowna International Airport	Kelowna	Canada
YLY	135	Langley Airport	Langley Township	Canada
YMA	135	Mayo Airport	Mayo	Canada
YMG	133	Manitouwadge Airport	Manitouwadge	Canada
YMH	125	Mary's Harbour Airport	Mary's Harbour	Canada
YMJ	119	Moose Jaw Air Vice Marshal C. M. McEwen Airport	Moose Jaw	Canada
YMM	85	Fort McMurray Airport	Fort Mcmurray	Canada
YMN	95	Makkovik Airport	Makkovik	Canada
YMO	133	Moosonee Airport	Moosonee	Canada
YMS	101	Moises Benzaquen Rengifo Airport	Yurimaguas	Peru
YMT	133	Chapais Airport	Chibougamau	Canada
YMW	133	Maniwaki Airport	Maniwaki	Canada
YMX	133	Montreal International (Mirabel) Airport	Montreal	Canada
YNA	133	Natashquan Airport	Natashquan	Canada
YNB	182	Prince Abdulmohsin Bin Abdulaziz Airport	Yenbo	Saudi Arabia
YNC	133	Wemindji Airport	Wemindji	Canada
YND	133	Ottawa / Gatineau Airport	Gatineau	Canada
YNE	136	Norway House Airport	Norway House	Canada
YNG	112	Youngstown Warren Regional Airport	Youngstown	United States
YNJ	186	Yanji Chaoyangchuan Airport	Yanji	China
YNL	119	Points North Landing Airport	Points North Landing	Canada
YNM	133	Matagami Airport	Matagami	Canada
YNO	136	North Spirit Lake Airport	North Spirit Lake	Canada
YNP	95	Natuashish Airport	Natuashish	Canada
YNS	133	Nemiscau Airport	Nemiscau	Canada
YNT	186	Yantai Laishan Airport	Yantai	China
YNY	185	Yangyang International Airport	Sokcho / Gangneung	South Korea
YNZ	186	Yancheng Airport	Yancheng	China
YOA	85	Ekati Airport	Ekati	Canada
YOC	135	Old Crow Airport	Old Crow	Canada
YOD	85	CFB Cold Lake	Cold Lake	Canada
YOG	133	Ogoki Post Airport	Ogoki Post	Canada
YOH	136	Oxford House Airport	Oxford House	Canada
YOJ	85	High Level Airport	High Level	Canada
YOL	29	Yola Airport	Yola	Nigeria
YOO	133	Toronto/Oshawa Executive Airport	Oshawa	Canada
YOP	85	Rainbow Lake Airport	Rainbow Lake	Canada
YOW	133	Ottawa Macdonald-Cartier International Airport	Ottawa	Canada
YPA	119	Prince Albert Glass Field	Prince Albert	Canada
YPC	85	Paulatuk (Nora Aliqatchialuk Ruben) Airport	Paulatuk	Canada
YPD	133	Parry Sound Area Municipal Airport	Parry Sound	Canada
YPE	85	Peace River Airport	Peace River	Canada
YPG	136	Southport Airport	Portage-la-prairie	Canada
YPH	133	Inukjuak Airport	Inukjuak	Canada
YPJ	133	Aupaluk Airport	Aupaluk	Canada
YPL	78	Pickle Lake Airport	Pickle Lake	Canada
YPM	136	Pikangikum Airport	Pikangikum	Canada
YPN	133	Port Menier Airport	Port Menier	Canada
YPO	133	Peawanuck Airport	Peawanuck	Canada
YPQ	133	Peterborough Airport	Peterborough	Canada
YPR	135	Prince Rupert Airport	Prince Pupert	Canada
YPW	135	Powell River Airport	Powell River	Canada
YPX	133	Puvirnituq Airport	Puvirnituq	Canada
YPY	85	Fort Chipewyan Airport	Fort Chipewyan	Canada
YQA	133	Muskoka Airport	Muskoka	Canada
YQB	133	Quebec Jean Lesage International Airport	Quebec	Canada
YQC	133	Quaqtaq Airport	Quaqtaq	Canada
YQD	136	The Pas Airport	The Pas	Canada
YQF	85	Red Deer Regional Airport	Red Deer Industrial	Canada
YQG	133	Windsor Airport	Windsor	Canada
YQH	135	Watson Lake Airport	Watson Lake	Canada
YQI	95	Yarmouth Airport	Yarmouth	Canada
YQK	136	Kenora Airport	Kenora	Canada
YQL	85	Lethbridge County Airport	Lethbridge	Canada
YQM	95	Greater Moncton International Airport	Moncton	Canada
YQN	133	Nakina Airport	Nakina	Canada
YQQ	135	Comox Airport	Comox	Canada
YQR	119	Regina International Airport	Regina	Canada
YQT	133	Thunder Bay Airport	Thunder Bay	Canada
YQU	85	Grande Prairie Airport	Grande Prairie	Canada
YQV	119	Yorkton Municipal Airport	Yorkton	Canada
YQW	119	North Battleford Airport	North Battleford	Canada
YQX	125	Gander International Airport	Gander	Canada
YQY	95	Sydney / J.A. Douglas McCurdy Airport	Sydney	Canada
YQZ	135	Quesnel Airport	Quesnel	Canada
YRA	85	Rae Lakes Airport	Gamètì	Canada
YRB	136	Resolute Bay Airport	Resolute	Canada
YRF	95	Cartwright Airport	Cartwright	Canada
YRG	95	Rigolet Airport	Rigolet	Canada
YRI	133	Rivière-du-Loup Airport	Riviere Du Loup	Canada
YRJ	133	Roberval Airport	Roberval	Canada
YRL	136	Red Lake Airport	Red Lake	Canada
YRM	85	Rocky Mountain House Airport	Rocky Mountain House	Canada
YRQ	133	Trois-Rivières Airport	Trois Rivieres	Canada
YRS	136	Red Sucker Lake Airport	Red Sucker Lake	Canada
YRT	136	Rankin Inlet Airport	Rankin Inlet	Canada
YRV	135	Revelstoke Airport	Revelstoke	Canada
YSB	133	Sudbury Airport	Sudbury	Canada
YSC	133	Sherbrooke Airport	Sherbrooke	Canada
YSD	85	Suffield Heliport	Suffield	Canada
YSF	119	Stony Rapids Airport	Stony Rapids	Canada
YSJ	95	Saint John Airport	St. John	Canada
YSM	85	Fort Smith Airport	Fort Smith	Canada
YSO	95	Postville Airport	Postville	Canada
YSP	133	Marathon Airport	Marathon	Canada
YSR	133	Nanisivik Airport	Nanisivik	Canada
YST	136	St. Theresa Point Airport	St. Theresa Point	Canada
YSU	95	Summerside Airport	Summerside	Canada
YSY	85	Sachs Harbour (David Nasogaluak Jr. Saaryuaq) Airport	Sachs Harbour	Canada
YTA	133	Pembroke Airport	Pembroke	Canada
YTE	133	Cape Dorset Airport	Cape Dorset	Canada
YTF	133	Alma Airport	Alma	Canada
YTH	136	Thompson Airport	Thompson	Canada
YTL	136	Big Trout Lake Airport	Big Trout Lake	Canada
YTM	133	La Macaza / Mont-Tremblant International Inc Airport	Mont-Tremblant	Canada
YTQ	133	Tasiujaq Airport	Tasiujaq	Canada
YTR	133	CFB Trenton	Trenton	Canada
YTS	133	Timmins/Victor M. Power	Timmins	Canada
YTY	186	Yangzhou Taizhou Airport	Yangzhou	China
YTZ	133	Billy Bishop Toronto City Centre Airport	Toronto	Canada
YUB	85	Tuktoyaktuk Airport	Tuktoyaktuk	Canada
YUD	133	Umiujaq Airport	Umiujaq	Canada
YUE	210	Yuendumu Airport	Yuendumu 	Australia
YUL	133	Montreal / Pierre Elliott Trudeau International Airport	Montreal	Canada
YUM	115	Yuma MCAS/Yuma International Airport	Yuma	United States
YUS	186	Yushu Batang Airport	Yushu	China
YUT	136	Repulse Bay Airport	Repulse Bay	Canada
YUX	133	Hall Beach Airport	Hall Beach	Canada
YUY	133	Rouyn Noranda Airport	Rouyn	Canada
YVA	267	Iconi Airport	Moroni	Comoros
YVB	133	Bonaventure Airport	Bonaventure	Canada
YVC	119	La Ronge Airport	La Ronge	Canada
YVG	85	Vermilion Airport	Vermillion	Canada
YVM	133	Qikiqtarjuaq Airport	Broughton Island	Canada
YVO	133	Val-d'Or Airport	Val D'or	Canada
YVP	133	Kuujjuaq Airport	Quujjuaq	Canada
YVQ	85	Norman Wells Airport	Norman Wells	Canada
YVR	135	Vancouver International Airport	Vancouver	Canada
YVT	119	Buffalo Narrows Airport	Buffalo Narrows	Canada
YVV	133	Wiarton Airport	Wiarton	Canada
YVZ	136	Deer Lake Airport	Deer Lake	Canada
YWA	133	Petawawa Airport	Petawawa	Canada
YWB	133	Kangiqsujuaq (Wakeham Bay) Airport	Kangiqsujuaq	Canada
YWG	136	Winnipeg / James Armstrong Richardson International Airport	Winnipeg	Canada
YWH	135	Victoria Harbour Seaplane Base	Victoria	Canada
YWJ	85	Déline Airport	Deline	Canada
YWK	95	Wabush Airport	Wabush	Canada
YWL	135	Williams Lake Airport	Williams Lake	Canada
YWM	125	Williams Harbour Airport	Williams Harbour	Canada
YWP	133	Webequie Airport	Webequie	Canada
YWS	135	Whistler/Green Lake Water Aerodrome	Whistler	Canada
YWY	85	Wrigley Airport	Wrigley	Canada
YXC	85	Cranbrook/Canadian Rockies International Airport	Cranbrook	Canada
YXD	85	Edmonton City Centre (Blatchford Field) Airport	Edmonton	Canada
YXE	119	Saskatoon John G. Diefenbaker International Airport	Saskatoon	Canada
YXH	85	Medicine Hat Airport	Medicine Hat	Canada
YXJ	82	Fort St John Airport	Fort Saint John	Canada
YXK	133	Rimouski Airport	Rimouski	Canada
YXL	136	Sioux Lookout Airport	Sioux Lookout	Canada
YXN	136	Whale Cove Airport	Whale Cove	Canada
YXP	133	Pangnirtung Airport	Pangnirtung	Canada
YXR	133	Earlton (Timiskaming Regional) Airport	Earlton	Canada
YXS	135	Prince George Airport	Prince George	Canada
YXT	135	Northwest Regional Airport Terrace-Kitimat	Terrace	Canada
YXU	133	London Airport	London	Canada
YXX	135	Abbotsford Airport	Abbotsford	Canada
YXY	135	Whitehorse / Erik Nielsen International Airport	Whitehorse	Canada
YXZ	133	Wawa Airport	Wawa	Canada
YYB	133	North Bay Jack Garland Airport	North Bay	Canada
YYC	85	Calgary International Airport	Calgary	Canada
YYD	135	Smithers Airport	Smithers	Canada
YYE	135	Fort Nelson Airport	Fort Nelson	Canada
YYF	135	Penticton Airport	Penticton	Canada
YYG	95	Charlottetown Airport	Charlottetown	Canada
YYH	85	Taloyoak Airport	Spence Bay	Canada
YYJ	135	Victoria International Airport	Victoria	Canada
YYL	136	Lynn Lake Airport	Lynn Lake	Canada
YYN	119	Swift Current Airport	Swift Current	Canada
YYQ	136	Churchill Airport	Churchill	Canada
YYR	95	Goose Bay Airport	Goose Bay	Canada
YYT	125	St. John's International Airport	St. John's	Canada
YYU	133	Kapuskasing Airport	Kapuskasing	Canada
YYW	133	Armstrong Airport	Armstrong	Canada
YYY	133	Mont Joli Airport	Mont Joli	Canada
YYZ	133	Lester B. Pearson International Airport	Toronto	Canada
YZD	133	Downsview Airport	Toronto	Canada
YZE	133	Gore Bay Manitoulin Airport	Gore Bay	Canada
YZF	85	Yellowknife Airport	Yellowknife	Canada
YZG	133	Salluit Airport	Salluit	Canada
YZH	85	Slave Lake Airport	Slave Lake	Canada
YZP	135	Sandspit Airport	Sandspit	Canada
YZR	133	Chris Hadfield Airport	Sarnia	Canada
YZS	78	Coral Harbour Airport	Coral Harbour	Canada
YZT	135	Port Hardy Airport	Port Hardy	Canada
YZU	85	Whitecourt Airport	Whitecourt	Canada
YZV	133	Sept-Îles Airport	Sept-iles	Canada
YZW	135	Teslin Airport	Teslin	Canada
YZX	95	CFB Greenwood	Greenwood	Canada
YZY	186	Zhangye Ganzhou Airport	Zhangye	China
YZZ	135	Trail Airport	Trail	Canada
ZAC	136	York Landing Airport	York Landing	Canada
ZAD	261	Zadar Airport	Zadar	Croatia
ZAG	261	Zagreb Airport	Zagreb	Croatia
ZAH	191	Zahedan International Airport	Zahedan	Iran
ZAJ	164	Zaranj Airport	Zaranj	Afghanistan
ZAL	121	Pichoy Airport	Valdivia	Chile
ZAM	172	Zamboanga International Airport	Zamboanga	Philippines
ZAO	245	Cahors-Lalbenque Airport	Cahors	France
ZAR	29	Zaria Airport	Zaria	Nigeria
ZAT	186	Zhaotong Airport	Zhaotong	China
ZAZ	239	Zaragoza Air Base	Zaragoza	Spain
ZBF	95	Bathurst Airport	Bathurst	Canada
ZBM	133	Bromont (Roland Desourdy) Airport	Bromont	Canada
ZBR	191	Konarak Airport	Chah Bahar	Iran
ZCL	107	General Leobardo C. Ruiz International Airport	Zacatecas	Mexico
ZCN	219	Celle Airport	Celle	Germany
ZEC	23	Secunda Airport	Secunda	South Africa
ZEM	133	Eastmain River Airport	Eastmain River	Canada
ZER	150	Ziro Airport	Zero	India
ZFA	135	Faro Airport	Faro	Canada
ZFD	119	Fond-Du-Lac Airport	Fond-Du-Lac	Canada
ZFM	85	Fort Mcpherson Airport	Fort Mcpherson	Canada
ZFN	85	Tulita Airport	Tulita	Canada
ZGI	136	Gods River Airport	Gods River	Canada
ZGR	136	Little Grand Rapids Airport	Little Grand Rapids	Canada
ZGS	67	La Romaine Airport	La Romaine	Canada
ZGU	277	Gaua Island Airport	Gaua Island	Vanuatu
ZHA	186	Zhanjiang Airport	Zhanjiang	China
ZHI	262	Grenchen Airport	Grenchen	Switzerland
ZHY	186	Zhongwei Shapotou Airport	Zhongwei	China
ZIA	243	Zhukovsky International Airport	Ramenskoe	Russia
ZIG	15	Ziguinchor Airport	Ziguinchor	Senegal
ZIH	107	Ixtapa Zihuatanejo International Airport	Zihuatanejo	Mexico
ZIN	262	Interlaken Air Base	Interlaken	Switzerland
ZJI	262	Locarno Airport	Locarno	Switzerland
ZJN	136	Swan River Airport	Swan River	Canada
ZKB	34	Kasaba Bay Airport	Kasaba Bay	Zambia
ZKE	133	Kashechewan Airport	Kashechewan	Canada
ZKG	67	Kegaska Airport	Kegaska	Canada
ZKP	188	Zyryanka Airport	Zyryanka	Russia
ZLO	107	Playa De Oro International Airport	Manzanillo	Mexico
ZLT	67	La Tabatière Airport	La Tabatière	Canada
ZMG	219	Magdeburg "City" Airport	Magdeburg	Germany
ZMH	135	South Cariboo Region / 108 Mile Airport	108 Mile Ranch	Canada
ZMM	107	Zamora Airport	Zamora	Mexico
ZMT	135	Masset Airport	Masset	Canada
ZNA	135	Nanaimo Harbour Water Airport	Nanaimo	Canada
ZND	43	Zinder Airport	Zinder	Niger
ZNE	214	Newman Airport	Newman	Australia
ZNF	219	Hanau Army Air Field	Hanau	Germany
ZNZ	16	Abeid Amani Karume International Airport	Zanzibar	Tanzania
ZOS	121	Cañal Bajo Carlos - Hott Siebert Airport	Osorno	Chile
ZPB	136	Sachigo Lake Airport	Sachigo Lake	Canada
ZPC	121	Pucón Airport	Pucon	Chile
ZPH	112	Zephyrhills Municipal Airport	Zephyrhills	United States
ZQL	219	Donaueschingen-Villingen Airport	Donaueschingen	Germany
ZQN	274	Queenstown International Airport	Queenstown International	New Zealand
ZQW	219	Zweibrücken Airport	Zweibruecken	Germany
ZRH	262	Zürich Airport	Zurich	Switzerland
ZRJ	136	Round Lake (Weagamow Lake) Airport	Round Lake	Canada
ZSA	111	San Salvador Airport	Cockburn Town	Bahamas
ZSE	272	Pierrefonds Airport	St.-pierre	Reunion
ZSJ	136	Sandy Lake Airport	Sandy Lake	Canada
ZSW	135	Prince Rupert/Seal Cove Seaplane Base	Prince Rupert	Canada
ZTB	67	Tête-à-la-Baleine Airport	Tête-à-la-Baleine	Canada
ZTH	217	Zakynthos International Airport "Dionysios Solomos"	Zakynthos	Greece
ZTM	136	Shamattawa Airport	Shamattawa	Canada
ZTR	234	Zhytomyr Airport	Zhytomyr	Ukraine
ZTU	145	Zaqatala International Airport	Zaqatala	Azerbaijan
ZUH	186	Zhuhai Jinwan Airport	Zhuhai	China
ZUM	95	Churchill Falls Airport	Churchill Falls	Canada
ZVA	263	Miandrivazo Airport	Miandrivazo	Madagascar
ZVK	195	Savannakhet Airport	Savannakhet	Laos
ZWA	263	Andapa Airport	Andapa	Madagascar
ZWL	119	Wollaston Lake Airport	Wollaston Lake	Canada
ZYI	186	Zunyi Xinzhou Airport	Zunyi	China
ZYL	153	Osmany International Airport	Sylhet Osmani	Bangladesh
ZZU	9	Mzuzu Airport	Mzuzu	Malawi`;


export type Airport = {
  /** Three-letter IATA code, upper-case. */
  iata: string;
  /** IANA timezone name. */
  timeZone: string;
  name: string;
  city: string;
  country: string;
};

let index: Map<string, Airport> | null = null;

function build(): Map<string, Airport> {
  const map = new Map<string, Airport>();
  for (const line of TABLE.split('\n')) {
    if (line === '') continue;
    const [iata, zoneIndex, name, city, country] = line.split('\t');
    if (iata === undefined || zoneIndex === undefined) continue;
    map.set(iata, {
      iata,
      timeZone: ZONES[Number(zoneIndex)] ?? 'UTC',
      name: name ?? '',
      city: city ?? '',
      country: country ?? '',
    });
  }
  return map;
}

function airports(): Map<string, Airport> {
  index ??= build();
  return index;
}

/** The airport for a code, or `undefined` — the form asks rather than guessing. */
export function lookupAirport(code: string): Airport | undefined {
  return airports().get(code.trim().toUpperCase());
}

/** The zone for an airport code, or `undefined` if the code is unknown. */
export function airportTimeZone(code: string): string | undefined {
  return lookupAirport(code)?.timeZone;
}

/**
 * Substring search over code, name and city, for the picker. An exact code
 * match comes first — someone typing "LHR" wants Heathrow, not every airport
 * whose name happens to contain those letters.
 */
export function searchAirports(query: string, limit = 12): Airport[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];

  const exact: Airport[] = [];
  const partial: Airport[] = [];
  for (const a of airports().values()) {
    if (a.iata.toLowerCase() === q) {
      exact.push(a);
    } else if (
      a.iata.toLowerCase().startsWith(q) ||
      a.city.toLowerCase().includes(q) ||
      a.name.toLowerCase().includes(q)
    ) {
      if (partial.length < limit) partial.push(a);
    }
  }
  return [...exact, ...partial].slice(0, limit);
}

export const AIRPORT_COUNT = 5515;
