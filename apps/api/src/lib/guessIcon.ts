// Ghicește iconul Lucide potrivit pentru o categorie pe baza numelui
export function guessIconName(name: string): string | null {
  const n = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, ''); // elimină diacriticele

  if (/tech|soft|app|digit|cod|program|robot|ai\b|it\b|informatica|cyber/.test(n)) return 'Cpu';
  if (/eco|verde|natur|mediu|reciclare|recycl|plant|gradin|durabil|sustenabil/.test(n)) return 'Leaf';
  if (/art|design|creativitat|pictur|desen|muzeu|galerie|grafica/.test(n)) return 'Palette';
  if (/educ|scoal|scoal|studiu|invatat|curs|training|liceu|univers|pedagogie/.test(n)) return 'BookOpen';
  if (/social|comunitat|voluntar|ong|ajutor|solidar|civic/.test(n)) return 'Heart';
  if (/sanat|medical|medicat|clinic|spital|terapie|wellness/.test(n)) return 'HeartPulse';
  if (/food|mancar|restaurant|bucatar|culinar|reteta|pizza|cafea|aliment|gastro/.test(n)) return 'Utensils';
  if (/finant|financ|bani|invest|economii|credit|bursa|trading|crypto|contabil/.test(n)) return 'TrendingUp';
  if (/sport|fotbal|basket|tenis|antren|gym|fitness|miscare|atletism/.test(n)) return 'Dumbbell';
  if (/muzic|music|cantec|band|concert|audio|sunet|melodie/.test(n)) return 'Music';
  if (/foto|camera|video|film|cinema|media|streaming/.test(n)) return 'Camera';
  if (/auto|masina|transport|vehicul|motor\b|mobilitate/.test(n)) return 'Car';
  if (/fashion|moda|haine|vestiment|clothing|textile/.test(n)) return 'Shirt';
  if (/imobiliar|casa\b|acas|home\b|locuin|real.estate/.test(n)) return 'Home';
  if (/travel|calator|turism|vacanta|trip|aventura/.test(n)) return 'Plane';
  if (/animal|pet\b|caine|pisica|zoo|veterinar/.test(n)) return 'PawPrint';
  if (/gaming|joc\b|game\b|esport|jocuri video/.test(n)) return 'Gamepad2';
  if (/shop|magazin|retail|vanzare|comert|marketplace/.test(n)) return 'ShoppingBag';
  if (/startup|inovati|launch/.test(n)) return 'Rocket';
  if (/copii|baby\b|copil|kinderg|parenting/.test(n)) return 'Baby';
  if (/global|international|world|export|import/.test(n)) return 'Globe';
  if (/stiint|cercetare|research|lab\b|microscop/.test(n)) return 'Microscope';
  if (/constructie|arhitectur|cladire|building/.test(n)) return 'Building2';
  if (/flori|floare|gradina\b|plante|flower/.test(n)) return 'Flower2';
  if (/cafea|coffee|bar\b|lounge|bistro/.test(n)) return 'Coffee';
  if (/energie|solar|eolian|vant\b|wind\b|renewabl/.test(n)) return 'Sun';
  if (/recicl|sustenab|verde\b|green\b/.test(n)) return 'Recycle';
  if (/sapt|padure|natura|forest|tree/.test(n)) return 'TreePine';
  if (/smartphone|mobil\b|telefon|ios|android/.test(n)) return 'Smartphone';
  if (/diploma|absolvent|graduat/.test(n)) return 'GraduationCap';
  if (/lumina|idei|invent|creat/.test(n)) return 'Lightbulb';
  if (/trofeu|premiu|campion|castigat/.test(n)) return 'Trophy';
  if (/echipa|team|grup\b|colabor/.test(n)) return 'Users';
  if (/servicii|afaceri|business\b|compan|firma/.test(n)) return 'Briefcase';
  if (/magazin\b|store\b|shop\b/.test(n)) return 'Store';

  return null;
}
