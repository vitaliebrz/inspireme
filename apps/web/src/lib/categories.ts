import {
  // Tech & digital
  Cpu, Code2, Smartphone, Monitor, Laptop, Server, Database, Cloud, Wifi, Terminal,
  Bot, Gamepad2, Headphones, Camera, Video, Mic, Radio, Tv, Printer, HardDrive,
  Battery, Plug, Bluetooth, Bug, MousePointer2,
  // Business & finance
  Briefcase, TrendingUp, DollarSign, CreditCard, Wallet, PiggyBank, Coins, Banknote,
  Receipt, Landmark, Building2, Building, Store, ShoppingBag, ShoppingCart, Package,
  Truck, Factory, Handshake, Target, Rocket, Lightbulb, Award, Trophy, Medal, Crown,
  Gem, Scale, Calculator, BarChart3, PieChart, LineChart,
  // Food & drink
  Utensils, UtensilsCrossed, Coffee, Pizza, Apple, Cherry, Carrot, Beef, Fish, Egg,
  Milk, Wine, Beer, IceCream, Cake, Cookie, Salad, Soup, Wheat, Grape, Sandwich,
  CupSoda, Croissant, Popcorn, Candy,
  // Health & wellness
  HeartPulse, Heart, Stethoscope, Pill, Syringe, Activity, Brain, Bone, Dumbbell,
  Cross, Ambulance, Thermometer, Eye, Accessibility,
  // Nature & eco
  Leaf, TreePine, Trees, Flower, Flower2, Sprout, Recycle, Sun, Moon, CloudRain,
  Wind, Droplet, Droplets, Snowflake, Mountain, Waves, Globe, Bird, PawPrint, Rabbit,
  Dog, Cat, Turtle, Feather, Flame,
  // Education & science
  BookOpen, Book, GraduationCap, Pencil, PenTool, Ruler, School, Library, Backpack,
  Notebook, FileText, Newspaper, Presentation, Atom, FlaskConical, Microscope, Telescope,
  Languages, Puzzle,
  // Art & media
  Palette, Paintbrush, PaintBucket, Music, Music2, Film, Clapperboard, Image, Images,
  Aperture, Drama, Sparkles, Wand2, Scissors, Shapes,
  // Sports & activity
  Bike, Timer, Footprints, Tent, Goal, Zap,
  // Social & people
  Users, User, UserPlus, MessageCircle, MessageSquare, Send, Share2, ThumbsUp, Smile,
  HeartHandshake, Megaphone, Bell, Hash, AtSign,
  // Transport & travel
  Car, Bus, Plane, Ship, Fuel, MapPin, Map, Navigation, Compass, Anchor, Sailboat, TrainFront,
  // Home & lifestyle
  Home, Sofa, Bed, Lamp, Shirt, Watch, Glasses, Gift, Key, Lock, Umbrella, Baby,
  Wrench, Hammer, ShowerHead,
  // Misc / general
  Star, Tag, Bookmark, Flag, Shield, Layers, LayoutGrid, Boxes, Box, Clock, Calendar,
  Ticket, Infinity,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// ─────────────────────────────────────────────
// Mapare nume icon (stocat în DB) → componentă Lucide
// Shorthand: fiecare identificator importat devine o intrare cu același nume.
// ─────────────────────────────────────────────
export const ICON_MAP: Record<string, LucideIcon> = {
  Cpu, Code2, Smartphone, Monitor, Laptop, Server, Database, Cloud, Wifi, Terminal,
  Bot, Gamepad2, Headphones, Camera, Video, Mic, Radio, Tv, Printer, HardDrive,
  Battery, Plug, Bluetooth, Bug, MousePointer2,
  Briefcase, TrendingUp, DollarSign, CreditCard, Wallet, PiggyBank, Coins, Banknote,
  Receipt, Landmark, Building2, Building, Store, ShoppingBag, ShoppingCart, Package,
  Truck, Factory, Handshake, Target, Rocket, Lightbulb, Award, Trophy, Medal, Crown,
  Gem, Scale, Calculator, BarChart3, PieChart, LineChart,
  Utensils, UtensilsCrossed, Coffee, Pizza, Apple, Cherry, Carrot, Beef, Fish, Egg,
  Milk, Wine, Beer, IceCream, Cake, Cookie, Salad, Soup, Wheat, Grape, Sandwich,
  CupSoda, Croissant, Popcorn, Candy,
  HeartPulse, Heart, Stethoscope, Pill, Syringe, Activity, Brain, Bone, Dumbbell,
  Cross, Ambulance, Thermometer, Eye, Accessibility,
  Leaf, TreePine, Trees, Flower, Flower2, Sprout, Recycle, Sun, Moon, CloudRain,
  Wind, Droplet, Droplets, Snowflake, Mountain, Waves, Globe, Bird, PawPrint, Rabbit,
  Dog, Cat, Turtle, Feather, Flame,
  BookOpen, Book, GraduationCap, Pencil, PenTool, Ruler, School, Library, Backpack,
  Notebook, FileText, Newspaper, Presentation, Atom, FlaskConical, Microscope, Telescope,
  Languages, Puzzle,
  Palette, Paintbrush, PaintBucket, Music, Music2, Film, Clapperboard, Image, Images,
  Aperture, Drama, Sparkles, Wand2, Scissors, Shapes,
  Bike, Timer, Footprints, Tent, Goal, Zap,
  Users, User, UserPlus, MessageCircle, MessageSquare, Send, Share2, ThumbsUp, Smile,
  HeartHandshake, Megaphone, Bell, Hash, AtSign,
  Car, Bus, Plane, Ship, Fuel, MapPin, Map, Navigation, Compass, Anchor, Sailboat, TrainFront,
  Home, Sofa, Bed, Lamp, Shirt, Watch, Glasses, Gift, Key, Lock, Umbrella, Baby,
  Wrench, Hammer, ShowerHead,
  Star, Tag, Bookmark, Flag, Shield, Layers, LayoutGrid, Boxes, Box, Clock, Calendar,
  Ticket, Infinity,
};

// Lista ordonată de icone disponibile pentru picker-ul adminului (derivată din map)
export const AVAILABLE_ICONS: string[] = Object.keys(ICON_MAP);

// ─────────────────────────────────────────────
// Cuvinte-cheie RO pentru căutare (nume EN e oricum căutabil automat)
// Doar pentru iconițe unde numele englez nu e evident pentru un admin român.
// ─────────────────────────────────────────────
const ICON_ALIASES: Record<string, string> = {
  Cpu: 'tehnologie procesor calculator it',
  Code2: 'programare cod software it dezvoltare',
  Smartphone: 'telefon mobil',
  Laptop: 'calculator notebook',
  Server: 'gazduire hosting',
  Database: 'baza de date',
  Cloud: 'nor stocare',
  Bot: 'robot inteligenta artificiala ai',
  Gamepad2: 'jocuri gaming',
  Headphones: 'casti muzica audio',
  Camera: 'foto fotografie',
  Video: 'filmare',
  Mic: 'microfon podcast',
  Briefcase: 'afaceri business servici job',
  TrendingUp: 'crestere statistici',
  DollarSign: 'bani dolar finante',
  CreditCard: 'card plata',
  Wallet: 'portofel bani',
  PiggyBank: 'economii puscarie bani',
  Coins: 'monede bani',
  Banknote: 'bani bancnota',
  Landmark: 'banca institutie',
  Building2: 'cladire firma companie',
  Building: 'cladire firma',
  Store: 'magazin retail comert',
  ShoppingBag: 'cumparaturi shopping',
  ShoppingCart: 'cos cumparaturi',
  Package: 'colet livrare pachet',
  Truck: 'camion livrare transport',
  Factory: 'fabrica productie industrie',
  Handshake: 'colaborare parteneriat afacere',
  Target: 'tinta obiectiv scop',
  Rocket: 'racheta startup lansare',
  Lightbulb: 'idee bec inovatie',
  Award: 'premiu recunoastere',
  Trophy: 'trofeu castigator',
  Scale: 'juridic drept lege echilibru',
  Calculator: 'matematica calcul contabilitate',
  BarChart3: 'grafic statistici date',
  PieChart: 'grafic statistici',
  LineChart: 'grafic statistici',
  Utensils: 'mancare restaurant food gastronomie',
  UtensilsCrossed: 'mancare restaurant',
  Coffee: 'cafea cafenea bautura',
  Pizza: 'mancare fast food',
  Apple: 'fruct mar mancare',
  Wine: 'vin bautura',
  Beer: 'bere bautura',
  Cake: 'tort desert cofetarie',
  Wheat: 'grau agricultura cereale',
  HeartPulse: 'sanatate medical puls',
  Heart: 'inima sanatate iubire',
  Stethoscope: 'medic doctor sanatate',
  Pill: 'medicament farmacie pastila',
  Syringe: 'vaccin injectie medical',
  Brain: 'creier psihologie minte',
  Dumbbell: 'sport fitness sala gantera',
  Cross: 'medical spital sanatate',
  Leaf: 'eco natura frunza verde mediu',
  TreePine: 'copac padure natura brad',
  Trees: 'padure copaci natura',
  Flower: 'floare natura plante',
  Flower2: 'floare natura plante',
  Sprout: 'plante crestere eco natura',
  Recycle: 'reciclare eco mediu',
  Sun: 'soare energie solara vreme',
  Wind: 'vant energie eoliana',
  Droplet: 'apa picatura',
  Droplets: 'apa picaturi',
  Mountain: 'munte natura drumetie',
  Waves: 'apa mare valuri ocean',
  Globe: 'glob lume international mediu',
  Bird: 'pasare animal',
  PawPrint: 'animal laba companie',
  Dog: 'caine animal',
  Cat: 'pisica animal',
  Feather: 'pana pasare usor',
  Flame: 'foc flacara energie',
  BookOpen: 'carte educatie citit lectura',
  Book: 'carte educatie',
  GraduationCap: 'educatie scoala absolvire studenti',
  Pencil: 'scris creion editare',
  Ruler: 'rigla masura design',
  School: 'scoala educatie',
  Library: 'biblioteca carti',
  Backpack: 'ghiozdan scoala elevi',
  FileText: 'document fisier text',
  Newspaper: 'ziar stiri presa',
  Presentation: 'prezentare curs',
  Atom: 'stiinta fizica chimie',
  FlaskConical: 'chimie laborator stiinta experiment',
  Microscope: 'stiinta biologie laborator',
  Telescope: 'astronomie stiinta spatiu',
  Languages: 'limbi traducere',
  Puzzle: 'puzzle logica joc',
  Palette: 'arta pictura culori design',
  Paintbrush: 'pensula pictura arta',
  PaintBucket: 'vopsea arta',
  Music: 'muzica sunet',
  Film: 'film cinema video',
  Clapperboard: 'film productie cinema',
  Image: 'imagine foto',
  Images: 'imagini galerie foto',
  Drama: 'teatru actorie arta',
  Sparkles: 'stralucire magie nou',
  Scissors: 'foarfeca croitorie',
  Bike: 'bicicleta sport ciclism transport',
  Timer: 'cronometru timp',
  Users: 'utilizatori oameni comunitate social',
  User: 'utilizator persoana profil',
  MessageCircle: 'mesaj chat conversatie',
  MessageSquare: 'mesaj chat',
  Send: 'trimite mesaj',
  Megaphone: 'anunt marketing promovare',
  Bell: 'notificare clopotel',
  Car: 'masina auto transport',
  Bus: 'autobuz transport',
  Plane: 'avion zbor calatorie transport',
  Ship: 'nava vapor transport',
  Fuel: 'combustibil benzina',
  MapPin: 'locatie harta pin',
  Map: 'harta navigare',
  Navigation: 'navigare directie gps',
  Compass: 'busola directie',
  Home: 'casa acasa imobiliare',
  Sofa: 'canapea mobila casa',
  Bed: 'pat somn casa',
  Shirt: 'tricou haine moda fashion',
  Watch: 'ceas accesorii',
  Glasses: 'ochelari optica',
  Gift: 'cadou giveaway premiu',
  Key: 'cheie acces securitate',
  Lock: 'lacat securitate',
  Baby: 'bebelus copil familie',
  Wrench: 'unealta reparatii mecanic',
  Hammer: 'ciocan constructii unealta',
  Star: 'stea favorit rating',
  Tag: 'eticheta categorie',
  Bookmark: 'salveaza marcaj',
  Flag: 'steag tara raport',
  Shield: 'scut securitate protectie',
  LayoutGrid: 'grila layout general toate',
  Box: 'cutie pachet',
  Clock: 'ceas timp ora',
  Calendar: 'calendar data eveniment',
  Ticket: 'bilet eveniment',
};

// ─────────────────────────────────────────────
// Căutare iconițe (nume EN auto + cuvinte-cheie RO)
// ─────────────────────────────────────────────
function humanize(name: string): string {
  // „HeartPulse" → „heart pulse", „BarChart3" → „bar chart 3"
  return name
    .replace(/([a-z])([A-Z0-9])/g, '$1 $2')
    .replace(/([0-9])/g, ' $1')
    .toLowerCase()
    .trim();
}

export function searchIcons(query: string): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return AVAILABLE_ICONS;
  return AVAILABLE_ICONS.filter(
    (name) => humanize(name).includes(q) || (ICON_ALIASES[name] ?? '').includes(q),
  );
}

// ─────────────────────────────────────────────
// Fallback hardcodat pentru categoriile default (funcționează fără cache)
// ─────────────────────────────────────────────
const CATEGORY_ICONS: Record<string, LucideIcon> = {
  Toate: LayoutGrid,
  Tech: Cpu,
  Eco: Leaf,
  'Artă': Palette,
  'Educație': BookOpen,
  Social: Heart,
  'Sănătate': HeartPulse,
  Food: Utensils,
  'Finanțe': TrendingUp,
};

// Rezolvă un iconName string (stocat în DB) → componentă Lucide
export function resolveIcon(iconName: string | null | undefined): LucideIcon {
  if (iconName && ICON_MAP[iconName]) return ICON_MAP[iconName];
  return Tag;
}

// Fallback pentru componente care nu au acces la cache (categorii default mereu corecte)
export function getCategoryIcon(name: string): LucideIcon {
  return CATEGORY_ICONS[name] ?? Tag;
}
