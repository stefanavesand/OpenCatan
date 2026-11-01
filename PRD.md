# Spelhyllan / OpenCatan — Product Requirements Document

Version 3.0 · 2026-11-01 · Kravbas för nästa etapp, inte ett påstående om färdig produkt.

Denna PRD ersätter [ursprunglig PRD](docs/archive/PRD-2025-12-29.md). Originalets spelidéer bevaras som historik; påståenden om färdig funktion, licenser, värdöverföring och alla expansioner vid lansering är inte verifierade löften. Vid konflikt gäller denna PRD för kommande arbete. Versionsnumret gäller dokumentet, inte appversionen.

## 1. Mål och målgrupp

Bygg en samling brädspel för vänner som spelar på surfplattor, telefoner och datorer. OpenCatan är första större spelet. Tre-i-rad är ett litet referensspel för att verifiera installation, sessioner och transporter innan komplexiteten ökar.

Börja med en installerbar PWA, med iPad som första verifierade enhet. Internetspel ska använda hanterad drift utan egen serveradministration. Senare ska samma produkt kunna paketeras för iOS/Android med Capacitor och få lokalt nätverk samt Bluetooth mellan plattformarna. Behåll webbteknik/TypeScript där den passar; Rust/Wasm är inget krav.

Lokala partier ska fungera utan internet eller inloggningsserver. Internetpartier får kräva internet. En nedladdad app innebär inte att ett internetparti kan fortsätta utan kontakt med spelvärden.

## 2. Etapper och avgränsningar

| Etapp | Leverans och grind |
|---|---|
| E0 — tekniskt referensspel | Installerbar PWA, lokalt sparat tre-i-rad och internetspel. Basen finns; återstående felvägar och mätning ska verifieras enligt §8. |
| E1 — gemensam sessionsgrund | Fristående regelmotor, versionshanterat sessionsprotokoll, hållbar sparning, privata vyer, definierade tillstånd/fel och vald hanterad exekveringsmiljö. Verifiera först med tre-i-rad. |
| E2 — OpenCatan grundspel | 3–4 spelare, touchanpassat UI, komplett avgränsat grundspel, sparning och återanslutning. Inkluderar spelarhandel; fullständiga naturliga partier ska verifieras. Publicering av medföljande tillgångar kräver rättighetsgranskning. |
| E3 — native och lokala transporter | Capacitor iOS/Android; verifiera LAN/TCP och därefter Bluetooth separat. Spelvärdens tillit och återställning ska vara dokumenterade. |
| Senare | Expansioner, 5–6 spelare, direkt P2P/WebRTC, kontolänkning, åskådare, AI och automatisk värdöverföring kräver egen prioritering. |

Ingen stor omskrivning: ersätt avgränsade flöden och behåll fungerande installationer/sparningar. Native, Bluetooth och expansioner ingår inte i nästa implementation. OpenCatans äldre PartyKit-kod är återanvändningsunderlag, inte bindande val av molntjänst. Lovable Cloud är verifierad prototypdrift; slutligt val för en gemensam TypeScript-motor är öppet.

## 3. Nuläge och evidens

Status: **M** = manuellt bekräftat, **A** = automatiskt verifierat inom angiven omfattning, **K** = kodgranskat, **P** = planerat. Ett passerat scenario är inte en generell garanti.

| Område | Evidens per 2026-11-01 | Kvar |
|---|---|---|
| PWA-installation, offline-start, uppdatering och lokalt tre-i-rad | M: användaren har bekräftat på iPad. A: cacheintegritet, felande uppdatering, lagringsfel och återställning. | Bredare iOS/Android-matris, långvarig lagring. |
| Tre-i-rad online, Lovable Cloud | M: användaren har bekräftat att 1.2.0 fungerar på sina enheter. A: ett fullständigt parti med två isolerade webbläsaridentiteter mot verklig backend, polling och återanslutning. | Separata fysiska nätverk och exakta vilolägesscenarier är inte specificerat bekräftade. |
| Kommandon och fel i PWA | A: simulerat förlorat svar, identisk omsändning efter omladdning, paus offline och bevarad identitet vid misslyckad tokenförnyelse. | Full fel-/versionsmatris; säkrare hantering av förlorad identitet. |
| OpenCatan | A: lokala PartyKit-scenarier för startplacering och spelprogression till vinst med förberedda fixtures. A/K: delar av reglerna och skyddade spelarvyer. | Naturligt komplett parti, 3–4 deltagare, spelarhandel, fullständig sparning och sekretessgranskning. |
| Säkerhet och drift | K: prototypens RLS, validerande RPC och publik klientnyckel. Lovable rapporterade 11 passerade backend-/regeltester; dessa är inte oberoende omkörda här. | Rate limiting, missbruk, retention, kostnadsskydd och full hotmodell är inte färdiga. |
| Rättigheter | README anger MIT; faktisk licensfil och belägg för tillgångarnas rättigheter saknades vid första granskning. | Rättigheter måste styrkas eller tillgångar ersättas före berörd distribution. |

Senaste körningar före denna dokumentändring: 41 enhetstester, 12 deterministiska PWA-tester och ett separat verkligt backend-E2E passerade. Ingen ny testkörning påstås av detta dokument. Se [online-PWA](docs/ONLINE_PWA.md), [lokalt spel](docs/LOCAL_GAME.md), [regelgranskning](docs/BASE_RULES.md) och [sessions-E2E](docs/SESSION_E2E.md). Global lintskuld kvarstår i OpenCatan.

## 4. Spelomfattning

För E2: 19 hexagoner, fem resurser, startplacering i vänd ordning, slumpad turordning, tärningar och resursproduktion, begränsad bank, vägar/byar/städer, utvecklingskort och kortlek, rövare/sju/kasta/stjäla, bank-/hamnhandel, spelarhandel, längsta väg, största armé och vinst på aktiv spelares tur (normalt 10 poäng). Ogiltiga drag får inte ändra tillstånd. Slump ska genereras av auktoriteten med lämplig säker slumpkälla; ingen klient får välja tärningsutfall eller kort.

Regelreferens och uttryckliga varianter ska dokumenteras och testas; ursprunglig ambition om Colonist-paritet räcker inte som specifikation eller licens. Exakta kart-/rövarvarianter fastställs inför E2. Välj obegränsad tur som första baslinje; timer och automatiska drag kräver uttryckliga spelregler och får inte baseras på klientens bakgrundskörning. Expansioner och deras varianter ligger utanför E2.

## 5. User stories och acceptanskriterier

Krav-ID:n är stabila. A = måste för respektive etapp, B = senare förbättring. Varje rad ska kopplas till verifiering i §8 och HLD; måldesign är inte implementationsstatus.

| ID / etapp / prioritet | Story | Acceptanskriterier |
|---|---|---|
| UX-01 / E0 / A | Som spelare vill jag installera och öppna appen utan nät. | Givet komplett verifierat resurspaket, när appen kallstartas offline, så visas spelhyllan och lokalt spel kan öppnas. ”Klart för offline” visas först efter kontroll av samtliga nödvändiga filer. Avbruten första hämtning ger inte klarstatus. |
| UX-02 / E1 / A | Jag vill återuppta ett lokalt parti. | Efter varje färdigt drag är tillståndet hållbart sparat. Vid full stängning och omstart återkommer senaste godkända drag. Vid nekad lagring/kvotfel genomförs inget nytt drag; fel och återförsök visas. |
| UX-03 / E1 / A | Jag vill bjuda in och ansluta utan registreringsformulär. | Skapa rum ger en delbar inbjudan. Två referensspelare respektive 3–4 grundspelare får unika platser. Ogiltigt/fullt rum ger tydligt besked. Upprepad anslutning med samma identitet tar ingen extra plats. |
| UX-04 / E1 / A | Jag vill veta om mitt drag genomfördes. | UI skiljer väntande, godkänt, avvisat och okänt utfall. Samma kommando efter timeout ger samma hållbara resultat och aldrig ett extra drag. Gammal revision uppdaterar spelbilden utan automatisk omtolkning av spelarens val. |
| UX-05 / E1 / A | Jag vill komma tillbaka efter nätavbrott eller iPad-vila. | Samma identitet återfår platsen; väntande kommando löses och aktuell behörig spelbild hämtas före nya drag. Ingen bakgrundsexekvering krävs. Vid förlorad identitet informeras spelaren; ingen tyst ersättning skapar falsk återanslutning. |
| UX-06 / E2 / A | Jag vill att mina hemliga kort förblir privata. | Andras klienter får inga hemliga kort/kortlekar via spelbild, meddelande, fel, logg eller statistik. Publika antal och egna kort visas korrekt. Återanslutning och avslut följer samma uttryckliga synlighetsregler. |
| UX-07 / E1 / A | Jag vill uppdatera utan att förlora partiet. | Trasigt nytt resurspaket lämnar fungerande version kvar. Aktivering sker kontrollerat; pågående lagringsoperation avslutas och väntande kommando bevaras. Okänd spar-/protokollversion bevaras och ger begripligt stopp. Migrering är testad eller uppskjuten utan destruktiv ändring. |
| UX-08 / E2 / A | Jag vill spela ett korrekt grundspel på iPad. | Samtliga avgränsade grundregler kan användas med touch, tydliga tur-/felbesked och utan krav på hover. Ett naturligt komplett parti med 3 respektive 4 spelare kan slutföras utan manuellt tillståndsingrepp. |
| UX-09 / E3 / A | Jag vill spela lokalt utan tjänstekonto. | Offline lokal identitet kan delta via tillgänglig native-transport; kapabiliteter och begränsningar visas. Tjänsten för internetautentisering kontaktas inte. Värdförlust ger ärlig paus/återställning, inte osäker automatisk värdöverföring. |
| UX-10 / E1 / A | Jag vill förstå hur min sparning skyddas. | Appen begär beständig webblagring där det stöds, hanterar avslag och erbjuder säker kopia för lokalt spel. Molnsparning skiljs från lokal kopia. Kopior med hemliga data har tydlig målgrupp och varning. |

## 6. Tvärgående krav

### Arkitektur och dataintegritet

| ID | Krav och kontrollbar innebörd |
|---|---|
| ARC-01 | Separera UI, regelmotor, spelsession, transport och lagring. Regelmotorn får inte importera UI, PartyKit, nätverk eller lagring; slump och tid tillförs uttryckligt. Samma regelimplementation används av auktoriteterna. |
| ARC-02 | Transport beskriver internetkrav, leverans/ordning, riktade meddelanden, payloadgräns, discovery och uppdateringssätt. Sessionskorrekthet får inte bero på en transports automatiska reconnect. |
| DATA-01 | Stabil identitet, unikt kommando-ID, revisionsnummer och versionsfält. Auktoriteten verifierar identitet och behörighet, binder ID till innehåll och skyddar mot samtidig skrivning. Samma ID med annat innehåll ger konflikt. |
| DATA-02 | Ett godkänt kommando innebär atomiskt hållbart tillstånd och kvitto före bekräftelse. Krasch efter commit men före svar återhämtas utan dubbelt drag. Full intern spelbild för återställning skiljs från varje spelares vy. |
| DATA-03 | Versionera protokoll, sparformat och regler. Ej stödda versioner ger definierat fel utan överskrivning. Återställning innehåller nödvändig intern fas-/slumpinformation utan att röja den för obehöriga. |
| DATA-04 | IndexedDB är första ordinarie lokala spelstore med utbytbart gränssnitt. Prototypens localStorage för onlineidentitet/utkorg är tillfällig. Molnlagring, lokala kopior och utkast har uttrycklig auktoritet och retention. |

### Autentisering, säkerhet och integritet

| ID | Krav och kontrollbar innebörd |
|---|---|
| SEC-01 | Internetspel använder verifierad autentisering även utan kontoformulär. Identitet hämtas från verifierat token/anslutning, aldrig från betrodd klientparameter. Lokal identitet kräver ingen server. Tokenförnyelse får inte tyst ersätta identitet. |
| SEC-02 | Varje läsning, kommando och prenumeration kontrollerar medlemskap och rättighet. Rums-ID/inbjudan är inte läsbehörighet eller spelaridentitet. Anslutning valideras; återanslutning tar aldrig annans plats. |
| SEC-03 | Auktoriteten validerar meddelandeformat, version, storlek och handling; klient kan inte skriva auktoritativt tillstånd direkt. Publika och privata fält tillåts uttryckligen per mottagare. Hemlig information skyddas också i loggar/telemetri. |
| SEC-04 | TLS för internet, minsta backendbehörighet, serverhemligheter endast på servern, skydd mot skriptinjektion, beroendegranskning och restriktiv CSP där plattformen medger. CORS ersätter inte autentisering/behörighet. |
| SEC-05 | Gränser för identitetsskapande, rumsskapande, joinförsök, läsningar, kommandon, samtidiga anslutningar och payloadstorlek. Kombinera identitet/IP/rum där tillämpligt; NAT får inte låsa normala spelkvällar. Överbelastning ger definierad väntan utan att kasta väntande kommando. |
| SEC-06 | Hotmodell omfattar illvillig deltagare, obehörig, läckt länk/token, replay, masskapande och felkonfigurerad databehörighet. Molntjänsten respektive lokal värdenhet är betrodd auktoritet och kan läsa intern hemlig information; skydd mot illvillig värd ingår inte. |
| SEC-07 | Dokumentera datatyper, lagringstider, gallring, åtkomst och radering, inklusive kommandokvitton och säkerhetskopior. Samla inte mer persondata än nödvändigt. Radering/utgång ska synas som slutligt tillstånd, inte ändlös reconnect. |

### Drift, användbarhet och distribution

| ID | Krav och kontrollbar innebörd |
|---|---|
| OPS-01 | Hanterad drift, separat test-/produktionsmiljö, versionsstyrd driftsättning och återställningsplan. Ingen egen VPS krävs. Backendändringar får inte oavsiktligt slå sönder installerade äldre klienter. |
| OPS-02 | Mät svarstid, återanslutningar, avvisningar, rate limits, lagringsfel och kostnad utan hemliga data. Sätt budget/larm och definiera vem som ingriper; larm är inte i sig ett kostnadstak. |
| OPS-03 | Gallring och kvoter får inte radera pågående partier oväntat. Villkor för inaktivitet, avslut, lagringsperiod och ev. förlust av åtkomst visas före relevant åtgärd. |
| NFR-01 | Onlineparti blockerar nya drag tills det är synkroniserat. Offlinepaket, internetstatus och spelanslutning är skilda begrepp i UI. Fel ska ange vad som hänt och vad spelaren kan göra. |
| NFR-02 | Föreslagna acceptansmål inför E1: p95 hållbart dragkvitto ≤1 s och synlig motspelaruppdatering ≤6 s, i deklarerat friskt testnät med 20 samtidiga referensrum. Mätpunkt, nätlatens och last redovisas; detta är mål, inte uppmätta garantier eller en publik kapacitetsutfästelse. |
| NFR-03 | iPad/Safari och installerad PWA är obligatoriska verifieringsmål. Inför bredare lansering testas aktuell samt närmast föregående tillgängliga iOS/iPadOS-huvudversion, Android Chrome och desktop Chromium; exakta versioner noteras. Touch, tangentbord, fokus och statusmeddelanden ska fungera. |
| LEG-01 | Inventera faktisk kodlicens och rättigheter för bilder, ljud, typsnitt, namn och övriga tillgångar. Bevara attribution. Distribuera endast tillgångar med dokumenterad rätt eller egna ersättningar; README-text ensam styrker inte rättigheter. |

## 7. Tillstånd och fel som produktkrav

Tillstånd för anslutning, kommandon och parti ska vara separata. Ett parti kan pågå hos auktoriteten medan en spelare är frånkopplad. HLD ska visa utlösare, villkor, sidoeffekter och vilka tillstånd som överlever omstart.

| Situation | Krävt beteende |
|---|---|
| Timeout/okänt utfall | Behåll samma kommando-ID och payload; slå upp/omsänd efter återanslutning. Visa inte ”avvisat” enbart på grund av timeout. |
| Gammal revision/ogiltigt drag | Visa senaste tillåtna vy respektive orsaken. Ingen automatisk omtolkning till ett nytt drag. |
| Lagringsfel | Ingen godkännandebekräftelse före hållbar commit. Om serverutfall är okänt behåll intent för utredning/återförsök. |
| Authfel/förlorad identitet | Försök säker förnyelse; annars blockera och erbjud begriplig återställningsväg utan att ta en annan spelares plats. |
| Rate limit/överbelastning | Respektera `Retry-After`, ökande väntetid och slumpvariation; avbryt bakgrundspolling och undvik storm vid återanslutning. |
| Auktoritet försvinner | Moln: återställ senaste hållbara tillstånd när tjänsten återkommer. Lokal värd: pausa tills rätt värd kan återställa; ingen automatisk överföring i första version. |
| Versionsfel/utgånget rum | Bevara data, ge explicit slutligt besked och tillåt inte ändlös återförsökning eller destruktiv migration. |

## 8. Verifieringsplan och releasegrindar

Enhetstester verifierar rena regler och tillstånd, integrationstester verifierar atomisk lagring/protokoll/behörighet, E2E verifierar användarflöden och felinjektion. Verkliga enheter krävs för installation, vila och återkomst. Testfall nedan är krav på kommande täckning, inte en lista över passerade tester.

| Fall | Kopplade krav | Obligatoriska scenarier / nivå |
|---|---|---|
| T-01 | UX-01, UX-07, NFR-03 | Kallstart offline; trasig första hämtning; avbruten uppdatering; tidigare version och sparning överlever. E2E + iPad. |
| T-02 | UX-02, UX-10, DATA-02/03/04 | Kvotfel/nekad beständighet, samtidiga lokala skrivare, krasch före/efter commit, korrupt/future schema, säker export/import. Integration + E2E. |
| T-03 | UX-03/05, SEC-01/02 | Samma identitet, fullt/fel rum, tredje spelare, stulen plats, tokenförnyelse/förlust, Safari kontra installerad lagring. Integration + två enheter. |
| T-04 | UX-04, DATA-01/02 | Dubbelsändning, annat innehåll med samma ID, samtidiga drag, tappat kvitto, serverkrasch efter commit, fördröjda/omordnade vyer. Integration + felinjicerad E2E. |
| T-05 | UX-05, ARC-02, NFR-01 | Olika nätverk, nätbyte, vila/full stängning, tjänsteavbrott och återkomst. Inte bara simulerad offlineflagga. Enheter + E2E. |
| T-06 | UX-06, SEC-02/03/06 | Avlyssna klienternas faktiska payloads, prenumerationer, loggar, fel och återställning. Inga andras kort eller interna snapshot; attacker med förfalskad identitet och direkt databasåtkomst nekas. Integration + E2E. |
| T-07 | UX-08, ARC-01 | Regelinvarianter (resursbevarande, giltiga faser, kortlek, vinst), naturliga fulla 3-/4-spelarpartier och alla grundspelsflöden inklusive handel. Enhet + integration + enheter. |
| T-08 | SEC-04/05, OPS-02, NFR-02 | Stor/okänd payload, auth/rum/join-spam, NAT, reconnectstorm, 429/Retry-After, mätbar last och budgetlarm. Begränsad testmiljö, inte oannonserad last mot produktion. |
| T-09 | UX-07, DATA-03, OPS-01 | Gammal klient/ny backend och omvänt, kontrollerad uppdatering med väntande drag, migrationfel och rollback. Integration + E2E. |
| T-10 | UX-09, SEC-06, OPS-03/SEC-07 | Lokal värdförlust/återställning med skyddade hemligheter; utgång, gallring/radering och kvitto-retention med explicit recovery-fel. Integration/enheter per etapp. |
| T-11 | LEG-01 | Tillgångsinventering med licensbelägg/attribution och kontroll av faktiskt distributionspaket. Dokument-/paketgranskning. |

E1 är klar först när kontrakt och tillstånd implementerats i referensspelet, T-01–05 och relevanta T-08–10 verifierats, hotmodell och mätgränser dokumenterats samt en hanterad gemensam regelkörning demonstrerats. E2 kräver dessutom T-06/07/11, komplett avgränsat grundspel, sekretessgranskning och verifierad återställning av full intern spelbild. En prototyp på GitHub Pages är inte dessa releasegrindar.

## 9. Beslut och öppna frågor

Fast inriktning: PWA först, återanvänd TypeScript, utbytbara lager, hanterad internetdrift, lokalt utan inloggningsserver, inga Bluetooth-/värdöverföringsbyggen nu. Systemdesignen ska göra följande beslut konkreta före motsvarande implementation:

- Exekvering av samma regelmotor online/lokalt; Lovable-experiment eller annan hanterad miljö. Dubbla SQL-/TypeScript-regler får inte bli OpenCatans målarkitektur.
- Återställning av förlorad anonym identitet utan att röja hemligheter; eventuell framtida kontolänkning.
- Exakta rate limits, kvitto-/spelretention, kostnadsbudget, backup/RPO/RTO och driftansvar. Återstartsskydd är inte samma sak som skydd mot leverantörens dataförlust.
- Grundspelets regelreferens/varianter, distributionens rättigheter samt produktnamn.

HLD och efterföljande beslut ska länka krav-ID:n; ändrade produktkrav uppdateras här först. Historiska granskningsrapporter behåller sina datum och sin verifieringsomfattning.
