import { PrismaClient, Role, Plan, IdeaVisibility } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  console.log('Seeding baza de date...');

  // Admin
  const adminHash = await bcrypt.hash('Admin@2026!', 12);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@inspireme.ro' },
    update: {},
    create: {
      email: 'admin@inspireme.ro',
      passwordHash: adminHash,
      role: Role.ADMIN,
      plan: Plan.PRO,
      firstLogin: false,
      onboardingComplete: true,
      profileElev: undefined,
    },
  });
  console.log('Admin creat:', admin.email);

  // Elev demo
  const elevHash = await bcrypt.hash('Elev@2026!', 12);
  const elev = await prisma.user.upsert({
    where: { email: 'elev.demo@inspireme.ro' },
    update: {},
    create: {
      email: 'elev.demo@inspireme.ro',
      passwordHash: elevHash,
      role: Role.ELEV,
      plan: Plan.GRATUIT,
      firstLogin: false,
      onboardingComplete: true,
      profileElev: {
        create: {
          firstName: 'Ana',
          lastName: 'Popescu',
          school: 'Colegiul Național "Mihai Eminescu"',
          class: '11',
          city: 'Cluj-Napoca',
          bio: 'Pasionată de tehnologie și antreprenoriat.',
          interests: ['TECH', 'ECO'],
        },
      },
    },
  });
  console.log('Elev demo creat:', elev.email);

  // Antreprenor demo
  const antreprenorHash = await bcrypt.hash('Antreprenor@2026!', 12);
  const antreprenor = await prisma.user.upsert({
    where: { email: 'mentor.demo@inspireme.ro' },
    update: {},
    create: {
      email: 'mentor.demo@inspireme.ro',
      passwordHash: antreprenorHash,
      role: Role.ANTREPRENOR,
      plan: Plan.PRO,
      firstLogin: false,
      onboardingComplete: true,
      profileAntreprenor: {
        create: {
          firstName: 'Mihai',
          lastName: 'Ionescu',
          company: 'TechStartup SRL',
          position: 'CEO & Fondator',
          domain: 'TECH',
          website: 'https://techstartup.ro',
          bioMentor: 'Fondator cu 10 ani experiență în tech. Ajut tinerii să-și transforme ideile în produse reale.',
          experienceYears: 10,
        },
      },
    },
  });
  console.log('Antreprenor demo creat:', antreprenor.email);

  // Idee demo
  const idea = await prisma.idea.upsert({
    where: { id: 'demo-idea-001' },
    update: {},
    create: {
      id: 'demo-idea-001',
      userId: elev.id,
      title: 'EcoTrack — Aplicație monitorizare amprenta carbon',
      categories: ['Eco'],
      problem: 'Tinerii nu sunt conștienți de impactul zilnic al acțiunilor lor asupra mediului. Nu există o modalitate simplă și gamificată de a urmări și reduce amprenta de carbon la nivel individual.',
      solution: 'O aplicație mobilă care calculează automat amprenta de carbon pe baza obiceiurilor zilnice (transport, alimentație, consum energie) și gamifică procesul de reducere prin provocări, badge-uri și comparații cu prietenii.',
      targetAudience: 'Tineri 15-25 ani, studenți și elevi conștienți de problemele de mediu.',
      tags: ['eco', 'mobile', 'gamification', 'carbon'],
      visibility: IdeaVisibility.PUBLIC,
      planAtPost: Plan.GRATUIT,
      wordCount: 120,
    },
  });
  console.log('Idee demo creată:', idea.title);

  // Categorii dinamice — inserăm doar dacă nu există deja
  const defaultCategories = [
    { name: 'Eco',       iconName: 'Leaf',       order: 0 },
    { name: 'Tech',      iconName: 'Cpu',        order: 1 },
    { name: 'Artă',      iconName: 'Palette',    order: 2 },
    { name: 'Educație',  iconName: 'BookOpen',   order: 3 },
    { name: 'Sănătate',  iconName: 'HeartPulse', order: 4 },
    { name: 'Social',    iconName: 'Heart',      order: 5 },
    { name: 'Food',      iconName: 'Utensils',   order: 6 },
    { name: 'Finanțe',   iconName: 'TrendingUp', order: 7 },
  ];

  for (const cat of defaultCategories) {
    await prisma.category.upsert({
      where: { name: cat.name },
      update: { iconName: cat.iconName },
      create: cat,
    });
  }
  console.log('Categorii inserate:', defaultCategories.map((c) => c.name).join(', '));

  console.log('\n✅ Seed complet!');
  console.log('Admin: admin@inspireme.ro / Admin@2026!');
  console.log('Elev: elev.demo@inspireme.ro / Elev@2026!');
  console.log('Antreprenor: mentor.demo@inspireme.ro / Antreprenor@2026!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
