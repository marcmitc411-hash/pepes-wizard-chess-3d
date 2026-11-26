import type { OpeningEntry, StrategyEntry } from './types.ts';

export const OPENINGS_CATALOG: OpeningEntry[] = [
  {
    id: 'italian-game',
    eco: 'C50',
    category: 'open',
    difficulty: 'beginner',
    recommendedSide: 'w',
    name: {
      de: 'Italienische Partie',
      en: 'Italian Game',
    },
    movesSan: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'c3', 'Nf6', 'd3'],
    summary: {
      de: 'Eine der ältesten und lehrreichsten Eröffnungen: Weiß entwickelt zügig Figuren, zielt auf das schwache Feld f7 und baut mit c3+d4 ein starkes Zentrum auf.',
      en: 'One of the oldest and most instructive openings: White develops rapidly, eyes the vulnerable f7 square, and prepares a strong pawn center with c3 and d4.',
    },
    keyIdeasWhite: [
      { de: 'Schnelle Königssicherheit durch frühe Rochade (O-O).', en: 'Rapid king safety via early kingside castling (O-O).' },
      { de: 'Zentrumsaufbau mit c3 und d3/d4, sobald Schwarz entwickelt ist.', en: 'Build the center with c3 and d3/d4 once development is complete.' },
      { de: 'Druck entlang der Diagonale a2–g8 auf das Feld f7.', en: 'Maintain pressure along the a2–g8 diagonal toward f7.' },
    ],
    keyIdeasBlack: [
      { de: 'Gegendruck auf e4 durch ...Nf6 und ...d6 oder ...d5.', en: 'Counter-pressure against e4 with ...Nf6 and ...d6 or ...d5.' },
      { de: 'Läufer c5 aktiv halten und bei c3/d4 rechtzeitig mit ...Bb6 ausweichen.', en: 'Keep the c5 bishop active and retreat to b6 when challenged.' },
    ],
    watchOut: {
      de: 'Vorsicht vor verfrühtem Ng5 ohne Deckung oder dem bekannten Blackburne-Schilling-Trick (...Nd4).',
      en: 'Watch out for premature Ng5 attacks and tactical traps like ...Nd4 after Nxe5.',
    },
  },
  {
    id: 'ruy-lopez',
    eco: 'C65',
    category: 'open',
    difficulty: 'intermediate',
    recommendedSide: 'w',
    name: {
      de: 'Spanische Partie (Ruy Lopez)',
      en: 'Ruy Lopez (Spanish Opening)',
    },
    movesSan: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O'],
    summary: {
      de: 'Der Klassiker der Meisterebene: Mit Lb5 übt Weiß indirekten Druck auf den Verteidiger des Bauern e5 aus und kämpft langfristig um Raumvorteil.',
      en: 'A grandmaster cornerstone: Bb5 pressures the knight defending e5, creating lasting strategic tension and space advantage.',
    },
    keyIdeasWhite: [
      { de: 'Turm nach e1 bringen, c3 und d4 vorbereiten.', en: 'Place the rook on e1 and prepare the central push c3 and d4.' },
      { de: 'Den Weißfeldrigen Läufer über a4–b3–c2 für den Königsangriff umgruppieren.', en: 'Maneuver the light-squared bishop via a4–b3–c2 toward the kingside.' },
    ],
    keyIdeasBlack: [
      { de: 'Mit ...a6 und ...b5 den Läufer abdrängen oder die Berliner Verteidigung wählen.', en: 'Challenge the bishop with ...a6 and ...b5 or adopt solid Berlin setups.' },
      { de: 'Gegenspiel im Zentrum mit ...d6 oder dem Marshall-Gegenangriff ...d5.', en: 'Seek central counterplay with ...d6 or timely ...d5 breaks.' },
    ],
    watchOut: {
      de: 'Nach 3...a6 4.Ba4 Nf6 5.O-O Nxe4? steht kein dauerhafter Bauerngewinn an — Weiß erobert mit d4 und Re1 stark zurück.',
      en: 'Beware of grabbing on e4 blindly without preparation; White regains it with strong central pressure via d4 and Re1.',
    },
  },
  {
    id: 'scotch-game',
    eco: 'C45',
    category: 'open',
    difficulty: 'beginner',
    recommendedSide: 'w',
    name: {
      de: 'Schottische Partie',
      en: 'Scotch Game',
    },
    movesSan: ['e4', 'e5', 'Nf3', 'Nc6', 'd4', 'exd4', 'Nxd4'],
    summary: {
      de: 'Weiß öffnet das Zentrum bereits im 3. Zug mit d4, gewinnt Raum für seine Figuren und vermeidet lange geschlossene Manöver.',
      en: 'White blasts open the center on move 3 with d4, gaining open lines and active piece play right away.',
    },
    keyIdeasWhite: [
      { de: 'Freie Linien für Läufer und Dame sowie Raumvorteil durch den e4-Bauern.', en: 'Open diagonals for bishops and queen alongside a spatial edge from the e4 pawn.' },
      { de: 'Schnelle Entwicklung mit Be3, Nc3 und langer oder kurzer Rochade.', en: 'Rapid piece activity with Be3, Nc3, and flexible castling.' },
    ],
    keyIdeasBlack: [
      { de: 'Den Springer auf d4 mit ...Bc5 oder ...Nf6 unter Druck setzen.', en: 'Challenge the centralized d4 knight immediately with ...Bc5 or ...Nf6.' },
      { de: 'Rechtzeitiger Gegenstoß ...d5 zum Ausgleich.', en: 'Strike back in the center with a well-timed ...d5.' },
    ],
    watchOut: {
      de: 'Schwarz darf nach ...Bc5 nicht passiv bleiben, sonst übernimmt Weiß das komplette Zentrum.',
      en: 'Passive black play allows White to dominate both central files and launch quick attacks.',
    },
  },
  {
    id: 'two-knights-defense',
    eco: 'C55',
    category: 'open',
    difficulty: 'intermediate',
    recommendedSide: 'b',
    name: {
      de: 'Zweispringerspiel im Nachzuge',
      en: 'Two Knights Defense',
    },
    movesSan: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6', 'Ng5', 'd5', 'exd5', 'Na5'],
    summary: {
      de: 'Eine scharfe, taktische Antwort auf die Italienische Partie: Schwarz greift sofort e4 an und opfert gegen Ng5 mutig einen Bauern für Initiative.',
      en: 'A sharp counterattacking reply to the Italian Game: Black hits e4 immediately and meets Ng5 with an energetic pawn sacrifice for the initiative.',
    },
    keyIdeasWhite: [
      { de: 'Nach Bb5+ c6 den Mehrbauern konsolidieren und Entwicklung aufholen.', en: 'Consolidate the extra pawn after Bb5+ c6 and catch up in development.' },
      { de: 'Gegenangriff auf f7 im Blick behalten, ohne die eigene Stellung zu überdehnen.', en: 'Keep pressure on f7 without overextending the knight on g5.' },
    ],
    keyIdeasBlack: [
      { de: 'Mit ...Na5 den Läufer c4 verjagen und mit ...h6 Tempo gewinnen.', en: 'Harass the c4 bishop with ...Na5 and gain tempi against the g5 knight with ...h6.' },
      { de: 'Freies Figurenspiel als Kompensation für den geopferten Bauern nutzen.', en: 'Use rapid piece coordination as dynamic compensation for the pawn.' },
    ],
    watchOut: {
      de: 'Nach 4.Ng5 d5 5.exd5 ist 5...Nxd5?! wegen 6.Nxf7! (Bratwurst- / Fried-Liver-Angriff) extrem gefährlich für Schwarz.',
      en: 'After 4.Ng5 d5 5.exd5, 5...Nxd5?! walks straight into the fierce 6.Nxf7! Fried Liver Attack.',
    },
  },
  {
    id: 'vienna-game',
    eco: 'C25',
    category: 'open',
    difficulty: 'beginner',
    recommendedSide: 'w',
    name: {
      de: 'Wiener Partie',
      en: 'Vienna Game',
    },
    movesSan: ['e4', 'e5', 'Nc3', 'Nf6', 'f4', 'd5'],
    summary: {
      de: 'Mit Nc3 deckt Weiß e4 flexibel und bereitet oft ein aggressives f4 (Wiener Gambit) vor — ohne die direkten Risiken des Königsgambits.',
      en: 'With Nc3, White reinforces e4 flexibly and often prepares an energetic f4 thrust without the immediate drawbacks of the King’s Gambit.',
    },
    keyIdeasWhite: [
      { de: 'Mit f4 die f-Linie öffnen und Druck gegen das schwarze Zentrum aufbauen.', en: 'Open the f-file with f4 and challenge Black’s hold on e5.' },
      { de: 'Alternativ ruhiger Aufbau mit Bc4 und d3.', en: 'Alternatively transition smoothly into quiet Bc4 and d3 structures.' },
    ],
    keyIdeasBlack: [
      { de: 'Auf f4 prinzipiell mit dem zentralen Gegenschlag ...d5 antworten.', en: 'Counter f4 with the principled central strike ...d5.' },
      { de: 'Nicht gierig auf f4 schlagen, falls Weiß mit e5 starken Angriff erhält.', en: 'Avoid grabbing on f4 blindly when e5 drives the knight away with tempo.' },
    ],
    watchOut: {
      de: 'Nach 2.Nc3 Nf6 3.f4 exf4? gewinnt Weiß mit 4.e5 viel Raum und treibt den Springer zurück.',
      en: 'After 2.Nc3 Nf6 3.f4 exf4?, 4.e5 grabs space and forces the knight to retreat awkwardly.',
    },
  },
  {
    id: 'sicilian-defense',
    eco: 'B50',
    category: 'semi_open',
    difficulty: 'intermediate',
    recommendedSide: 'b',
    name: {
      de: 'Sizilianische Verteidigung',
      en: 'Sicilian Defense',
    },
    movesSan: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3'],
    summary: {
      de: 'Die kämpferischste Antwort auf 1.e4: Schwarz kämpft asymmetrisch um d4, erhält die halboffene c-Linie und strebt nach aktivem Gegenspiel am Damenflügel.',
      en: 'The sharpest response to 1.e4: Black creates an asymmetrical battle, gaining the half-open c-file and queenside counterplay.',
    },
    keyIdeasWhite: [
      { de: 'Entwicklungsvorsprung für Angriffe am Königsflügel (Be3, f3, g4 oder Bg5) nutzen.', en: 'Use the lead in development to launch kingside attacks (Be3, f3, g4, or Bg5).' },
      { de: 'Kontrolle über das Feld d5 sichern.', en: 'Fight for control over the key central square d5.' },
    ],
    keyIdeasBlack: [
      { de: 'Türme und Dame auf der c-Linie aktivieren und mit ...b5/...a6 am Damenflügel vorgehen.', en: 'Activate pieces along the c-file and expand on the queenside with ...a6 and ...b5.' },
      { de: 'Zentralen Durchbruch ...d5 oder ...e5 vorbereiten.', en: 'Prepare a freeing central break with ...d5 or ...e5.' },
    ],
    watchOut: {
      de: 'Vernachlässigt Schwarz seine Königssicherheit oder Entwicklung, schlagen weiße Opfer auf e6 oder f5 oft tödlich durch.',
      en: 'If Black falls behind in development, sacrifices on e6 or f5 frequently crash through.',
    },
  },
  {
    id: 'french-defense',
    eco: 'C00',
    category: 'semi_open',
    difficulty: 'intermediate',
    recommendedSide: 'b',
    name: {
      de: 'Französische Verteidigung',
      en: 'French Defense',
    },
    movesSan: ['e4', 'e6', 'd4', 'd5', 'Nc3', 'Nf6', 'e5', 'Nfd7'],
    summary: {
      de: 'Solide und doch bissig: Schwarz fordert sofort mit ...d5 das Zentrum heraus und greift danach die weiße Bauernkette mit ...c5 und ...f6 an.',
      en: 'Resilient and counterattacking: Black immediately challenges d4 with ...d5, then undermines White’s pawn chain with ...c5 and ...f6.',
    },
    keyIdeasWhite: [
      { de: 'Raumvorteil durch den Keil e5 wahren und den schwarzen König bedrängen.', en: 'Preserve the spatial wedge on e5 and build kingside attacking chances.' },
      { de: 'Das wichtige Stützfeld d4 mit c3 und Nf3 stabilisieren.', en: 'Reinforce the d4 base with c3 and Nf3.' },
    ],
    keyIdeasBlack: [
      { de: 'Sofortiger Druck gegen d4 mittels ...c5, ...Nc6 und ...Qb6.', en: 'Attack the d4 base relentlessly with ...c5, ...Nc6, and ...Qb6.' },
      { de: 'Den eingesperrten Läufer c8 über d7–a4 oder b6 aktivieren.', en: 'Find active squares for the light-squared bishop via d7–b5 or b6.' },
    ],
    watchOut: {
      de: 'In vielen Varianten droht das klassische Läuferopfer Bxh7+ (Greek Gift), wenn Weiß auf d3/h7 frei zielt.',
      en: 'Beware of the classic Greek Gift bishop sacrifice Bxh7+ if the kingside lacks defenders.',
    },
  },
  {
    id: 'caro-kann',
    eco: 'B12',
    category: 'semi_open',
    difficulty: 'beginner',
    recommendedSide: 'b',
    name: {
      de: 'Caro-Kann-Verteidigung',
      en: 'Caro-Kann Defense',
    },
    movesSan: ['e4', 'c6', 'd4', 'd5', 'Nc3', 'dxe4', 'Nxe4', 'Bf5'],
    summary: {
      de: 'Äußerst solide Verteidigung gegen 1.e4: Mit ...c6 bereitet Schwarz ...d5 vor, ohne den weißfeldrigen Läufer c8 einzusperren.',
      en: 'Rock-solid reply to 1.e4: ...c6 supports ...d5 while keeping the diagonal open for the c8 bishop.',
    },
    keyIdeasWhite: [
      { de: 'Raumgewinn im Zentrum (e5 oder h4 gegen Bf5) anstreben.', en: 'Push for space advantage (e5 or h4 harassing the f5 bishop).' },
      { de: 'Schnelle Figurenentwicklung und Druck gegen die schwarze Königsstellung.', en: 'Build harmonious development and pressure Black’s king.' },
    ],
    keyIdeasBlack: [
      { de: 'Den Läufer f5 rechtzeitig nach g6/h7 in Sicherheit bringen und solide Bauernstruktur halten.', en: 'Tuck the bishop away to g6/h7 and rely on an ultra-solid pawn structure.' },
      { de: 'Nach Tausch vieler Leichtfiguren ein starkes Endspiel ansteuern.', en: 'Trade minor pieces toward favorable endgames.' },
    ],
    watchOut: {
      de: 'Auf 1.e4 c6 2.d4 d5 3.Nc3 dxe4 4.Nxe4 Nd7? droht tatsächlich 5.Qe2 Ngf6?? 6.Nd6# (Ersticktes Matt)!',
      en: 'After 4...Nd7?, watch out for 5.Qe2 Ngf6?? 6.Nd6# — a famous smothered mate trap!',
    },
  },
  {
    id: 'scandinavian-defense',
    eco: 'B01',
    category: 'semi_open',
    difficulty: 'beginner',
    recommendedSide: 'b',
    name: {
      de: 'Skandinavische Verteidigung',
      en: 'Scandinavian Defense',
    },
    movesSan: ['e4', 'd5', 'exd5', 'Qxd5', 'Nc3', 'Qa5', 'd4'],
    summary: {
      de: 'Direkte Herausforderung im 1. Zug: Schwarz beseitigt früh den e4-Bauern und etabliert eine kompakte Stellung mit klarer Struktur.',
      en: 'An immediate central challenge on move 1: Black eliminates White’s e4 pawn early and builds a clean, compact structure.',
    },
    keyIdeasWhite: [
      { de: 'Mit Nc3, d4, Nf3 und Bd2 Tempi gegen die schwarze Dame gewinnen.', en: 'Gain development tempi against Black’s queen with Nc3, d4, Nf3, and Bd2.' },
      { de: 'Zentrale Kontrolle nutzen, um Öffnungslinien zu dominieren.', en: 'Use central dominance to control open files and diagonals.' },
    ],
    keyIdeasBlack: [
      { de: 'Dame auf a5 oder d6 sicher platzieren, ...c6 spielen und Läufer f5/g4 entwickeln.', en: 'Tuck the queen safely on a5 or d6, play ...c6, and develop the c8 bishop outside the pawn chain.' },
    ],
    watchOut: {
      de: 'Mit der Dame auf a5 stets Abzüge über Bd2 / c4-b4 im Auge behalten.',
      en: 'Keep an eye on discovered attacks against the queen on a5 via Bd2 or b4.',
    },
  },
  {
    id: 'queens-gambit',
    eco: 'D06',
    category: 'closed',
    difficulty: 'beginner',
    recommendedSide: 'w',
    name: {
      de: 'Damengambit',
      en: "Queen's Gambit",
    },
    movesSan: ['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6', 'Bg5', 'Be7'],
    summary: {
      de: 'Eines der wichtigsten Fundamente des Positionsspiels: Weiß bietet scheinbar den c4-Bauern an, um die Kontrolle über das Zentrum (e4/d5) zu gewinnen.',
      en: 'A pillar of positional chess: White offers the c4 pawn temporarily to undermine d5 and seize central control.',
    },
    keyIdeasWhite: [
      { de: 'Druck auf d5 erhöhen (Nc3, Bg5, e3) und den Minoritätsangriff am Damenflügel vorbereiten.', en: 'Pile pressure on d5 and prepare queenside expansion or a central e4 break.' },
      { de: 'Harmonische Entwicklung aller Figuren vor entscheidenden Durchbrüchen.', en: 'Complete harmonious development before opening lines.' },
    ],
    keyIdeasBlack: [
      { de: 'Mit ...e6 (Abgelehntes Damengambit) oder ...c6 (Slawisch) d5 stabil stützen.', en: 'Maintain a strong pawn foothold on d5 via ...e6 or ...c6.' },
      { de: 'Befreiungszug ...c5 oder ...e5 im richtigen Moment ausführen.', en: 'Free the position with a timely ...c5 or ...e5 break.' },
    ],
    watchOut: {
      de: 'Nach 2...dxc4 3.e3 b5? 4.a4 c6 5.axb5 cxb5?? verliert 6.Qf3! einen ganzen Turm auf der langen Diagonale!',
      en: 'Trying to cling to the c4 pawn with ...b5? often fails to a4 and Qf3! winning the rook on a8.',
    },
  },
  {
    id: 'slav-defense',
    eco: 'D10',
    category: 'closed',
    difficulty: 'intermediate',
    recommendedSide: 'b',
    name: {
      de: 'Slawische Verteidigung',
      en: 'Slav Defense',
    },
    movesSan: ['d4', 'd5', 'c4', 'c6', 'Nf3', 'Nf6', 'Nc3', 'dxc4'],
    summary: {
      de: 'Sehr verlässliche Antwort auf das Damengambit: ...c6 verteidigt d5 solide, ohne den wichtigen Damenläufer c8 einzuschließen.',
      en: 'A rock-solid answer to the Queen’s Gambit: ...c6 supports d5 while keeping the light-squared bishop free to develop to f5 or g4.',
    },
    keyIdeasWhite: [
      { de: 'Mit a4 und e4 den Bauern c4 zurückerobern und starkes Zentrum aufbauen.', en: 'Prevent ...b5 with a4, regain c4, and push e4.' },
    ],
    keyIdeasBlack: [
      { de: 'Nach ...dxc4 oft ...Bf5 oder ...b5 spielen und aktive Figuren entwickeln.', en: 'Develop the c8 bishop to f5 or counterattack on the queenside.' },
    ],
    watchOut: {
      de: 'Ohne ...e6 bleibt das Feld f7 bei frühem Ne5 und Qh5 manchmal empfindlich.',
      en: 'Watch tactical tactics against f7 and b7 when bringing the c8 bishop out early.',
    },
  },
  {
    id: 'london-system',
    eco: 'D02',
    category: 'closed',
    difficulty: 'beginner',
    recommendedSide: 'w',
    name: {
      de: 'Londoner System',
      en: 'London System',
    },
    movesSan: ['d4', 'd5', 'Bf4', 'Nf6', 'e3', 'c5', 'c3', 'Nc6', 'Nd2'],
    summary: {
      de: 'Beliebtes, universelles Aufbausystem: Weiß errichtet ein stabiles Dreieck aus d4-c3-e3 mit aktivem Läufer auf f4 und klaren Plänen.',
      en: 'A popular, reliable system: White builds a rock-solid d4-c3-e3 pyramid with an active dark-squared bishop on f4.',
    },
    keyIdeasWhite: [
      { de: 'Vorposten e5 besetzen (Ne5) und Angriff am Königsflügel aufbauen.', en: 'Plant a knight on the e5 outpost and launch a kingside attack.' },
      { de: 'Läufer f4 bei Bedarf über g3 sichern, um die Diagonale h2–b8 zu behalten.', en: 'Tuck the f4 bishop back to g3 if attacked to preserve the h2–b8 diagonal.' },
    ],
    keyIdeasBlack: [
      { de: 'Das ungedeckte Feld b2 früh mit ...c5 und ...Qb6 unter Druck setzen.', en: 'Challenge the b2 pawn and center early with ...c5 and ...Qb6.' },
      { de: 'Mit ...Bd6 den starken London-Läufer f4 abtauschen.', en: 'Trade off White’s key f4 bishop with ...Bd6.' },
    ],
    watchOut: {
      de: 'Gegen ...Qb6 darf Weiß b2 nicht blind opfern, falls Schwarz ohne Risiko abräumt.',
      en: 'Do not leave b2 undefended if ...Qb6 creates concrete double threats.',
    },
  },
  {
    id: 'kings-indian',
    eco: 'E60',
    category: 'indian',
    difficulty: 'advanced',
    recommendedSide: 'b',
    name: {
      de: 'Königsindische Verteidigung',
      en: "King's Indian Defense",
    },
    movesSan: ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'Bg7', 'e4', 'd6', 'Nf3', 'O-O'],
    summary: {
      de: 'Dynamische Hypermoderne Verteidigung: Schwarz überlässt Weiß zunächst das Bauernzentrum, fianchettiert den Königsläufer und greift es später explosiv mit ...e5 oder ...c5 an.',
      en: 'A dynamic hypermodern defense: Black lets White build a broad pawn center, fianchettoes on g7, and strikes back with ...e5 or ...c5.',
    },
    keyIdeasWhite: [
      { de: 'Raumvorteil am Damenflügel (c5, b4) nutzen und schneller durchbrechen.', en: 'Expand on the queenside with c5 and b4 before Black’s kingside attack lands.' },
    ],
    keyIdeasBlack: [
      { de: 'Nach ...e5 und geschlossener Mitte das Zentrum mit ...f5–f4 am Königsflügel stürmen.', en: 'Close the center after ...e5 and launch a pawn storm with ...f5 and ...g5.' },
    ],
    watchOut: {
      de: 'Unterschätzt Weiß den Königsangriff nach ...f5, wird der weiße König oft von Bauern und Leichtfiguren überrollt.',
      en: 'Underestimating Black’s ...f5–f4 kingside storm can quickly become fatal for White’s king.',
    },
  },
  {
    id: 'nimzo-indian',
    eco: 'E20',
    category: 'indian',
    difficulty: 'advanced',
    recommendedSide: 'b',
    name: {
      de: 'Nimzo-Indische Verteidigung',
      en: 'Nimzo-Indian Defense',
    },
    movesSan: ['d4', 'Nf6', 'c4', 'e6', 'Nc3', 'Bb4', 'e3', 'O-O'],
    summary: {
      de: 'Eine der angesehensten Verteidigungen überhaupt: Mit ...Lb4 fesselt Schwarz den Springer c3 und kontrolliert das Zentrum durch Figuren statt früher Bauern.',
      en: 'One of chess’s highest-reputation defenses: ...Bb4 pins the c3 knight to fight for e4 through piece pressure rather than pawns.',
    },
    keyIdeasWhite: [
      { de: 'Läuferpaar sichern und mit f3 + e4 ein starkes Zentrum erzwingen.', en: 'Claim the bishop pair and prepare a broad center with f3 and e4.' },
    ],
    keyIdeasBlack: [
      { de: 'Weiß bei Gelegenheit Doppelbauern (c3/c4) zufügen und auf diesen Schwächen spielen.', en: 'Inflict doubled c-pawns when favorable and blockade on dark squares.' },
    ],
    watchOut: {
      de: 'Weiß darf nicht zulassen, dass die c-Bauern blockiert und zum leichten Ziel werden.',
      en: 'Allowing doubled c-pawns to get fixed by ...Ba6 and ...Na5 can leave White strategically lost.',
    },
  },
  {
    id: 'english-opening',
    eco: 'A10',
    category: 'flank',
    difficulty: 'intermediate',
    recommendedSide: 'w',
    name: {
      de: 'Englische Eröffnung',
      en: 'English Opening',
    },
    movesSan: ['c4', 'e5', 'Nc3', 'Nf6', 'g3', 'd5', 'cxd5', 'Nxd5'],
    summary: {
      de: 'Flexibles Flankenspiel mit 1.c4: Weiß kontrolliert das Feld d5 von der Seite und führt oft einen Sizilianer mit vertauschten Farben und einem Mehrtempo.',
      en: 'A flexible flank opening with 1.c4: White fights for d5 laterally and often plays a reversed Sicilian with an extra tempo.',
    },
    keyIdeasWhite: [
      { de: 'Fianchetto auf g2 zur Dominanz über die lange Diagonale h1–a8.', en: 'Fianchetto on g2 to dominate the long light-squared diagonal.' },
      { de: 'Damenflügel-Expansion mit Rb1, b4 und b5.', en: 'Expand on the queenside with Rb1, b4, and b5.' },
    ],
    keyIdeasBlack: [
      { de: 'Zentralen Raum mit ...e5, ...Nc6 und ...Bc5 oder ...d5 nutzen.', en: 'Claim central space with ...e5 and active minor piece development.' },
    ],
    watchOut: {
      de: 'Im umgekehrten Drachen (g3/Bg2) sollte Weiß ein frühes ...Bh3 oder ...d5 nicht ohne Gegenmittel zulassen.',
      en: 'Keep track of central breaks like ...d5 before White’s g2 bishop is fully coordinated.',
    },
  },
  {
    id: 'reti-opening',
    eco: 'A04',
    category: 'flank',
    difficulty: 'intermediate',
    recommendedSide: 'w',
    name: {
      de: 'Réti-Eröffnung',
      en: 'Réti Opening',
    },
    movesSan: ['Nf3', 'd5', 'c4', 'd4', 'e3', 'Nc6'],
    summary: {
      de: 'Ein Vorzeige-System der hypermodernen Schule: Weiß entwickelt zuerst den Springer nach f3 und greift ein vorgerücktes schwarzes Zentrum seitlich mit c4 und e3/g3 an.',
      en: 'A classic hypermodern system: White develops Nf3 first and attacks Black’s advanced center from the flanks with c4 and e3 or g3.',
    },
    keyIdeasWhite: [
      { de: 'Zentrumsfelder e5 und d4 durch Fianchetto-Läufer und Springer beherrschen.', en: 'Control central dark and light squares remotely using fianchettoed bishops.' },
    ],
    keyIdeasBlack: [
      { de: 'Den d4-Vorposten stabil stützen oder mit ...e5 Raum sichern.', en: 'Support the d4 wedge solidly and develop harmoniously behind it.' },
    ],
    watchOut: {
      de: 'Falls Schwarz den Bauern c4 mit ...dxc4 abgibt, muss Weiß die offene Diagonale zügig nutzen.',
      en: 'Avoid drifting passively after ...d4; immediately challenge the wedge with e3 or b4.',
    },
  },
];

export const STRATEGIES_CATALOG: StrategyEntry[] = [
  {
    id: 'tactic-fork',
    category: 'tactics',
    difficulty: 'beginner',
    orientSide: 'w',
    name: {
      de: 'Die Gabel (Doppelangriff)',
      en: 'The Fork (Double Attack)',
    },
    summary: {
      de: 'Eine einzelne Figur greift gleichzeitig zwei oder mehr wertvolle gegnerische Ziele an — meist kann nur eines davon gerettet werden.',
      en: 'A single piece attacks two or more valuable enemy targets simultaneously, usually winning at least one of them.',
    },
    keyPrinciples: [
      { de: 'Springer sind die gefährlichsten Gabelfiguren, da sie über andere Figuren springen und ungleiche Felder angreifen.', en: 'Knights are deadly forking pieces because they jump blockers and threaten pieces that cannot attack back.' },
      { de: 'Suche besonders nach ungedeckten Figuren und Königs-Schachgeboten, die eine Gabel erzwingen.', en: 'Look for undefended pieces and checks that leave a second target hanging.' },
    ],
    exampleFen: 'r3k3/8/8/3N4/8/8/8/4K3 w - - 0 1',
    exampleMovesSan: ['Nc7+', 'Kd8', 'Nxa8'],
    exampleExplanation: {
      de: 'Mit Sc7+ gibt der Springer Schach und greift zugleich den ungedeckten Turm auf a8 an — Schwarz muss ziehen und verliert den Turm.',
      en: 'Nc7+ delivers check while simultaneously attacking the rook on a8 — Black must move the king and loses the rook.',
    },
    highlightArrows: [
      { from: 'd5', to: 'c7', kind: 'best' },
      { from: 'c7', to: 'e8', kind: 'danger' },
      { from: 'c7', to: 'a8', kind: 'danger' },
    ],
  },
  {
    id: 'tactic-pin',
    category: 'tactics',
    difficulty: 'beginner',
    orientSide: 'w',
    name: {
      de: 'Die Fesselung',
      en: 'The Pin',
    },
    summary: {
      de: 'Eine Linienfigur (Läufer, Turm oder Dame) hält eine gegnerische Figur fest, weil dahinter der König (absolute Fesselung) oder eine wertvollere Figur steht.',
      en: 'A long-range piece (bishop, rook, or queen) immobilizes an enemy piece because moving it would expose the king or a higher-value piece behind it.',
    },
    keyPrinciples: [
      { de: 'Eine gefesselte Figur verliert ihre Verteidigungskraft und kann oft mit einem zweiten Angreifer („Druck auf den Gefesselten“) erobert werden.', en: 'Pile extra attackers onto a pinned piece ("PP on the PP") since it cannot safely flee.' },
      { de: 'Bei einer absoluten Fesselung vor dem König ist jedes Wegziehen regelwidrig.', en: 'An absolute pin against the king makes moving the pinned piece completely illegal.' },
    ],
    exampleFen: '4k3/5p2/4q3/8/8/8/8/3R2K1 w - - 0 1',
    exampleMovesSan: ['Re1', 'Kd7', 'Rxe6', 'fxe6'],
    exampleExplanation: {
      de: 'Te1 fesselt die schwarze Dame e6 absolut an den König e8. Die Dame kann der Linie nicht entkommen und fällt gegen den Turm.',
      en: 'Re1 pins the Black queen on e6 against the king on e8. Unable to escape the file, the queen is won for the rook.',
    },
    highlightArrows: [
      { from: 'd1', to: 'e1', kind: 'best' },
      { from: 'e1', to: 'e8', kind: 'danger' },
    ],
  },
  {
    id: 'tactic-skewer',
    category: 'tactics',
    difficulty: 'beginner',
    orientSide: 'w',
    name: {
      de: 'Der Spieß',
      en: 'The Skewer',
    },
    summary: {
      de: 'Das Gegenstück zur Fesselung: Eine wertvolle Figur (oft König oder Dame) wird direkt angegriffen, muss weichen und gibt die dahinter stehende Figur preis.',
      en: 'The reverse of a pin: a high-value piece (often king or queen) is attacked directly, forced to move, and exposes a piece behind it.',
    },
    keyPrinciples: [
      { de: 'Besonders häufig im Endspiel mit Türmen und Läufern auf langen Reihen oder Diagonalen.', en: 'Deadly in rook and bishop endgames along open ranks, files, and diagonals.' },
      { de: 'Schach-Spieße erzwingen das sofortige Wegziehen des Königs ohne Gegenwehr.', en: 'A checking skewer forces the king to step aside immediately.' },
    ],
    exampleFen: '6kq/8/8/8/8/8/8/R5K1 w - - 0 1',
    exampleMovesSan: ['Ra8+', 'Kg7', 'Rxh8'],
    exampleExplanation: {
      de: 'Ta8+ spießt den König g8 und die Dame h8 auf der 8. Reihe auf. Der König muss ziehen, Weiß schlägt die Dame.',
      en: 'Ra8+ skewers the king on g8 and the queen on h8 along the 8th rank. The king must flee, leaving the queen.',
    },
    highlightArrows: [
      { from: 'a1', to: 'a8', kind: 'best' },
      { from: 'a8', to: 'h8', kind: 'danger' },
    ],
  },
  {
    id: 'tactic-discovered-attack',
    category: 'tactics',
    difficulty: 'intermediate',
    orientSide: 'w',
    name: {
      de: 'Abzugsangriff & Abzugsschach',
      en: 'Discovered Attack & Discovered Check',
    },
    summary: {
      de: 'Eine Figur zieht weg und öffnet dadurch die Angriffslinie einer dahinter stehenden Figur — besonders stark, wenn die abziehende Figur selbst Schach gibt.',
      en: 'Moving one piece uncovers a hidden attack from a slider behind it — devastating when the moving piece itself delivers check.',
    },
    keyPrinciples: [
      { de: 'Während der Gegner auf das Schach der abziehenden Figur reagieren muss, bleibt das zweite Ziel schutzlos.', en: 'Because the opponent must answer the check, the uncovered target is captured on the next move.' },
    ],
    exampleFen: '4q1k1/5ppp/8/8/4B3/8/8/4R1K1 w - - 0 1',
    exampleMovesSan: ['Bxh7+', 'Kxh7', 'Rxe8'],
    exampleExplanation: {
      de: 'Lxh7+ gibt Schach und räumt die e-Linie für den Turm e1, der danach die schwarze Dame e8 gratis einsammelt.',
      en: 'Bxh7+ gives check while clearing the e-file so the rook on e1 wins the undefended Black queen on e8.',
    },
    highlightArrows: [
      { from: 'e4', to: 'h7', kind: 'best' },
      { from: 'e1', to: 'e8', kind: 'alt' },
    ],
  },
  {
    id: 'tactic-back-rank',
    category: 'tactics',
    difficulty: 'beginner',
    orientSide: 'w',
    name: {
      de: 'Grundreihenmatt',
      en: 'Back-Rank Mate',
    },
    summary: {
      de: 'Ist ein König hinter seinen eigenen ungerückten Bauern eingesperrt, reicht ein einziger Turm oder eine Dame auf der Grundreihe zum Matt.',
      en: 'When a castled king is trapped behind its own unmoved pawns, a single rook or queen on the back rank delivers checkmate.',
    },
    keyPrinciples: [
      { de: 'Frühzeitig ein „Luftloch“ (h3/g3 bzw. ...h6/...g6) schaffen, sobald Schwerfiguren die Grundreihe bedrohen.', en: 'Create "luft" (an escape square like h3/h6) before heavy pieces invade the back rank.' },
      { de: 'Verteidiger der Grundreihe lassen sich oft durch Ablenkungsopfer beseitigen.', en: 'Watch for deflection sacrifices against back-rank defenders.' },
    ],
    exampleFen: '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1',
    exampleMovesSan: ['Rd8#'],
    exampleExplanation: {
      de: 'Td8# ist sofort Schachmatt, weil die eigenen Bauern auf f7, g7 und h7 dem König jedes Fluchtfeld versperren.',
      en: 'Rd8# is instant checkmate because Black’s own pawns on f7, g7, and h7 seal the king’s escape.',
    },
    highlightArrows: [
      { from: 'd1', to: 'd8', kind: 'best' },
    ],
  },
  {
    id: 'strategy-center-development',
    category: 'strategy',
    difficulty: 'beginner',
    orientSide: 'w',
    name: {
      de: 'Zentrumskontrolle & Entwicklung',
      en: 'Center Control & Rapid Development',
    },
    summary: {
      de: 'Die goldenen Eröffnungsregeln: Zentrumsfelder (d4, d5, e4, e5) kontrollieren, Leichtfiguren zügig entwickeln und früh rochieren.',
      en: 'The golden opening principles: fight for central squares (d4, d5, e4, e5), develop knights and bishops early, and castle to safety.',
    },
    keyPrinciples: [
      { de: 'Im Zentrum entfalten Figuren ihre maximale Reichweite und wechseln blitzschnell zwischen beiden Flügeln.', en: 'Pieces in the center reach maximum mobility and can pivot quickly to either flank.' },
      { de: 'Ziehe in der Eröffnung jede Figur möglichst nur einmal und bringe die Dame nicht zu früh ins Feuer.', en: 'Avoid moving the same piece twice unnecessarily or exposing the queen early.' },
    ],
    exampleFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    exampleMovesSan: ['e4', 'e5', 'Nf3', 'Nc6', 'd4'],
    exampleExplanation: {
      de: 'Weiß besetzt e4, entwickelt den Springer nach f3 mit Angriff auf e5 und öffnet mit d4 sofort Linien für alle Figuren.',
      en: 'White claims e4, develops Nf3 attacking e5, and strikes with d4 to open lines for the entire army.',
    },
    highlightArrows: [
      { from: 'e2', to: 'e4', kind: 'best' },
      { from: 'g1', to: 'f3', kind: 'alt' },
      { from: 'd2', to: 'd4', kind: 'alt' },
    ],
  },
  {
    id: 'strategy-outpost',
    category: 'strategy',
    difficulty: 'intermediate',
    orientSide: 'w',
    name: {
      de: 'Der Springer-Vorposten',
      en: 'The Knight Outpost',
    },
    summary: {
      de: 'Ein zentrales Feld (oft d5, e5, d4 oder e4), das durch einen eigenen Bauern gedeckt ist und von keinem gegnerischen Bauern mehr vertrieben werden kann.',
      en: 'A central square (often on the 5th/6th rank) supported by a pawn where no enemy pawn can chase your knight away.',
    },
    keyPrinciples: [
      { de: 'Ein fest verankerter Springer auf d5/e5 lähmt das gegnerische Spiel und ist oft stärker als ein Läufer.', en: 'An unassailable knight on d5 or e5 radiates pressure into the opponent’s camp and often outvalues a bishop.' },
    ],
    exampleFen: 'r2q1rk1/pp3ppp/3b1n2/8/4P3/2N2N2/PP3PPP/R1BQR1K1 w - - 0 1',
    exampleMovesSan: ['Nd5', 'Re8', 'Bg5'],
    exampleExplanation: {
      de: 'Sd5 besetzt den idealen Vorposten im Herzen des Bretts, gedeckt von e4 und unangreifbar durch schwarze c- oder e-Bauern.',
      en: 'Nd5 occupies the dream outpost in the heart of the board, anchored by e4 with no enemy c- or e-pawn able to challenge it.',
    },
    highlightArrows: [
      { from: 'c3', to: 'd5', kind: 'best' },
      { from: 'e4', to: 'd5', kind: 'alt' },
    ],
  },
  {
    id: 'strategy-open-file',
    category: 'strategy',
    difficulty: 'intermediate',
    orientSide: 'w',
    name: {
      de: 'Offene Linie & 7. Reihe',
      en: 'Open File & The 7th Rank',
    },
    summary: {
      de: 'Türme brauchen freie Linien ohne Bauern: Wer eine offene Linie beherrscht und auf die 7. (bzw. 2.) Reihe eindringt, bindet König und Bauern des Gegners.',
      en: 'Rooks belong on open files: seizing an open file and invading the 7th rank traps the enemy king and attacks pawn bases from behind.',
    },
    keyPrinciples: [
      { de: 'Türme auf einer offenen Linie verdoppeln, bevor der Gegner sie abtauscht.', en: 'Double rooks on an open file to dominate entry squares.' },
      { de: 'Ein Turm auf der 7. Reihe ist oft einen ganzen Bauern als Kompensation wert.', en: 'A rook anchored on the 7th rank often provides full compensation for a pawn.' },
    ],
    exampleFen: '3r2k1/pp3ppp/8/8/8/8/PP3PPP/R5K1 w - - 0 1',
    exampleMovesSan: ['Rc1', 'Kf8', 'Rc7'],
    exampleExplanation: {
      de: 'Tc1 ergreift sofort die einzige offene Linie und dringt anschließend mit Tc7 auf die 7. Reihe gegen b7 und f7 ein.',
      en: 'Rc1 seizes the open c-file immediately and infiltrates to c7, pressuring Black’s 7th-rank pawns.',
    },
    highlightArrows: [
      { from: 'a1', to: 'c1', kind: 'best' },
      { from: 'c1', to: 'c7', kind: 'alt' },
    ],
  },
  {
    id: 'strategy-pawn-structure',
    category: 'strategy',
    difficulty: 'intermediate',
    orientSide: 'w',
    name: {
      de: 'Bauernstruktur & Doppelbauern',
      en: 'Pawn Structure & Doubled Pawns',
    },
    summary: {
      de: 'Bauern können nicht rückwärts ziehen — zerschlagene Bauerninseln (Doppel- oder Isolanis) bleiben oft das ganze Spiel über verwundbar, besonders vor dem König.',
      en: 'Pawns cannot move backwards — shattered pawn islands and doubled pawns in front of the king create lasting defensive targets.',
    },
    keyPrinciples: [
      { de: 'Aufgerissene Königsflügelbauern (z. B. nach Bxf6 gxf6) schwächen die Königssicherheit dauerhaft.', en: 'Forced ...gxf6 recaptures expose the castled king and create weak dark/light squares.' },
    ],
    exampleFen: 'r4rk1/ppq2ppp/2nb1n2/3p2B1/3P4/2N2N2/PP2PPPP/R2Q1RK1 w - - 0 1',
    exampleMovesSan: ['Bxf6', 'gxf6'],
    exampleExplanation: {
      de: 'Mit Lxf6 erzwingt Weiß gxf6: Schwarz behält zwar das Läuferpaar, verliert aber jeden sicheren Bauernschutz vor Kg8.',
      en: 'Bxf6 forces gxf6, shattering Black’s kingside pawn shelter and leaving the king exposed along the g-file.',
    },
    highlightArrows: [
      { from: 'g5', to: 'f6', kind: 'best' },
      { from: 'g7', to: 'f6', kind: 'danger' },
    ],
  },
  {
    id: 'strategy-fianchetto',
    category: 'strategy',
    difficulty: 'beginner',
    orientSide: 'w',
    name: {
      de: 'Fianchetto & Königssicherheit',
      en: 'Fianchetto & King Safety',
    },
    summary: {
      de: 'Beim Fianchetto (g3 + Lg2 bzw. b3 + Lb2) sichert der Läufer den rochierten König und kontrolliert aus der Ferne die gesamte lange Diagonale.',
      en: 'In a fianchetto (g3 + Bg2 or b3 + Bb2), the bishop shields the castled king while exerting long-range pressure across the main diagonal.',
    },
    keyPrinciples: [
      { de: 'Einen Fianchetto-Läufer nur ungern ohne Not gegen einen Springer tauschen — die entstandenen Löcher auf f3/h3 sind schwer zu verteidigen.', en: 'Protect your fianchettoed bishop; trading it off leaves vulnerable color complexes around your king.' },
    ],
    exampleFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    exampleMovesSan: ['g3', 'e5', 'Bg2', 'd5', 'Nf3', 'Nc6', 'O-O'],
    exampleExplanation: {
      de: 'Mit g3, Lg2 und O-O entsteht eine extrem widerstandsfähige Königsburg mit starkem Einfluss auf d5 und e4.',
      en: 'g3, Bg2, and O-O construct a resilient fortress while aiming directly at the central squares d5 and e4.',
    },
    highlightArrows: [
      { from: 'f1', to: 'g2', kind: 'best' },
      { from: 'g2', to: 'd5', kind: 'alt' },
    ],
  },
  {
    id: 'endgame-opposition',
    category: 'endgame',
    difficulty: 'intermediate',
    orientSide: 'w',
    name: {
      de: 'Königsopposition im Bauernendspiel',
      en: 'King Opposition in Pawn Endgames',
    },
    summary: {
      de: 'Stehen sich beide Könige mit einem Feld Abstand gegenüber, hat der Spieler die Opposition, der NICHT am Zug ist — und drängt den Gegner ab.',
      en: 'When kings stand opposite with one square between them, the side NOT to move holds the opposition and forces the rival king aside.',
    },
    keyPrinciples: [
      { de: 'Im Bauernendspiel gilt: König vor den Bauern bringen! Wer die Schlüsselfelder vor dem eigenen Bauern erobert, gewinnt.', en: 'Lead with the king in front of your pawn to seize the key squares ahead of it.' },
    ],
    exampleFen: '4k3/8/8/8/4P3/4K3/8/8 w - - 0 1',
    exampleMovesSan: ['Kd4', 'Ke7', 'Kd5', 'Kd7', 'e5'],
    exampleExplanation: {
      de: 'Mit Kd4! ergreift Weiß die Opposition: Schwarz muss ausweichen, sodass Weiß über d5 die entscheidenden Schlüsselfelder vor e4 erobert.',
      en: 'Kd4! takes the opposition: Black must give way, letting White’s king invade d5 ahead of the e-pawn.',
    },
    highlightArrows: [
      { from: 'e3', to: 'd4', kind: 'best' },
      { from: 'd4', to: 'd5', kind: 'alt' },
    ],
  },
  {
    id: 'endgame-passed-pawn',
    category: 'endgame',
    difficulty: 'beginner',
    orientSide: 'w',
    name: {
      de: 'Freibauer & Umwandlung',
      en: 'Passed Pawn & Promotion',
    },
    summary: {
      de: 'Ein Freibauer hat keinen gegnerischen Bauern mehr vor sich oder auf den Nachbarlinien. König und Bauer arbeiten zusammen, um die 8. Reihe zu erreichen.',
      en: 'A passed pawn has no enemy pawns ahead of it on its file or adjacent files. King and pawn coordinate to reach promotion.',
    },
    keyPrinciples: [
      { de: 'Im Endspiel entscheidet oft das 6.-Reihen-Gesetz: Steht der eigene König auf der 6. Reihe vor dem Freibauern, ist die Umwandlung meist nicht zu stoppen.', en: 'If your king reaches the 6th rank in front of the passed pawn, promotion is almost always guaranteed.' },
    ],
    exampleFen: '6k1/8/6K1/4P3/8/8/8/8 w - - 0 1',
    exampleMovesSan: ['e6', 'Kf8', 'Kf6', 'Ke8', 'e7', 'Kd7', 'Kf7'],
    exampleExplanation: {
      de: 'Nach e6 und Kf6 begleitet der weiße König seinen Freibauern bis auf die 7. Reihe und kontrolliert das Umwandlungsfeld e8.',
      en: 'After e6 and Kf6, White’s king escorts the passed pawn and takes control of the e8 promotion square.',
    },
    highlightArrows: [
      { from: 'e5', to: 'e6', kind: 'best' },
      { from: 'g6', to: 'f6', kind: 'alt' },
    ],
  },
];
