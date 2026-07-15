/**
 * Curățare assets orfane din Cloudinary.
 * Rulează: npx tsx --env-file .env scripts/cleanup-cloudinary.ts
 * Dry run (fără ștergere): npx tsx --env-file .env scripts/cleanup-cloudinary.ts --dry-run
 */

import { v2 as cloudinary } from 'cloudinary';
import { PrismaClient } from '@prisma/client';

const isDryRun = process.argv.includes('--dry-run');

cloudinary.config({
  cloud_name: process.env['CLOUDINARY_CLOUD_NAME'] ?? '',
  api_key:    process.env['CLOUDINARY_API_KEY'] ?? '',
  api_secret: process.env['CLOUDINARY_API_SECRET'] ?? '',
  secure:     true,
});

const prisma = new PrismaClient();

// ── Extrage publicId din URL Cloudinary ───────────────────────────────────────
function extractPublicId(url: string | null | undefined): string | null {
  if (!url) return null;
  const match = url.match(/\/upload\/(?:v\d+\/)?(.+?)(?:\.[^./]+)?$/);
  return match?.[1] ?? null;
}

// ── Listează TOATE asset-urile dintr-un folder (cu paginare) ─────────────────
async function listAllInFolder(
  prefix: string,
  resourceType: 'image' | 'raw',
): Promise<string[]> {
  const publicIds: string[] = [];
  let nextCursor: string | undefined;

  do {
    const res = await cloudinary.api.resources({
      type:          'upload',
      resource_type: resourceType,
      prefix,
      max_results:   500,
      next_cursor:   nextCursor,
    });
    for (const r of res.resources as { public_id: string }[]) {
      publicIds.push(r.public_id);
    }
    nextCursor = (res as { next_cursor?: string }).next_cursor;
  } while (nextCursor);

  return publicIds;
}

// ── Colectează publicId-urile active din DB ───────────────────────────────────
async function getActivePublicIds(): Promise<Set<string>> {
  const ids = new Set<string>();

  // Imagini idei (stocat direct)
  const ideaImages = await prisma.ideaImage.findMany({ select: { publicId: true } });
  ideaImages.forEach((i) => { if (i.publicId) ids.add(i.publicId); });

  // PDF-uri idei (stocat direct)
  const ideaPdfs = await prisma.ideaPdf.findMany({ select: { publicId: true } });
  ideaPdfs.forEach((p) => { if (p.publicId) ids.add(p.publicId); });

  // Avatare elevi (URL → extrage publicId)
  const elevProfiles = await prisma.profileElev.findMany({ select: { avatarUrl: true } });
  elevProfiles.forEach((p) => {
    const pid = extractPublicId(p.avatarUrl);
    if (pid) ids.add(pid);
  });

  // Avatare antreprenori (URL → extrage publicId)
  const antrepProfiles = await prisma.profileAntreprenor.findMany({ select: { avatarUrl: true } });
  antrepProfiles.forEach((p) => {
    const pid = extractPublicId(p.avatarUrl);
    if (pid) ids.add(pid);
  });

  // Avatare grupuri (URL → extrage publicId)
  const groups = await prisma.ideaGroup.findMany({ select: { avatarUrl: true } });
  groups.forEach((g) => {
    const pid = extractPublicId(g.avatarUrl);
    if (pid) ids.add(pid);
  });

  // Fișiere chat (URL → extrage publicId)
  const chatMessages = await prisma.message.findMany({
    where: { type: { in: ['IMAGE', 'PDF'] }, fileUrl: { not: null } },
    select: { fileUrl: true },
  });
  chatMessages.forEach((m) => {
    const pid = extractPublicId(m.fileUrl);
    if (pid) ids.add(pid);
  });

  // Fișiere mesaje de grup (URL → extrage publicId)
  const groupMessages = await prisma.groupMessage.findMany({
    where: { fileUrl: { not: null } },
    select: { fileUrl: true },
  });
  groupMessages.forEach((m) => {
    const pid = extractPublicId(m.fileUrl);
    if (pid) ids.add(pid);
  });

  return ids;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🔍 Mod: ${isDryRun ? 'DRY RUN (fără ștergere)' : 'LIVE (șterge efectiv)'}\n`);

  console.log('📦 Colectez publicId-urile active din DB...');
  const active = await getActivePublicIds();
  console.log(`   → ${active.size} asset-uri referențiate în DB\n`);

  // Foldere + tipuri de listat pe Cloudinary
  const folders: { prefix: string; resourceType: 'image' | 'raw' }[] = [
    { prefix: 'ideas/',        resourceType: 'image' },
    { prefix: 'ideas/pdfs/',   resourceType: 'raw'   },
    { prefix: 'avatars/',      resourceType: 'image' },
    { prefix: 'group_avatars/', resourceType: 'image' },
    { prefix: 'chat/',         resourceType: 'image' },
    { prefix: 'chat/',         resourceType: 'raw'   },
  ];

  let totalOrphans = 0;
  let totalDeleted = 0;

  for (const { prefix, resourceType } of folders) {
    const all = await listAllInFolder(prefix, resourceType);
    const orphans = all.filter((pid) => !active.has(pid));

    console.log(`📁 ${prefix} [${resourceType}]: ${all.length} total, ${orphans.length} orfane`);

    if (orphans.length === 0) continue;

    totalOrphans += orphans.length;

    if (isDryRun) {
      orphans.forEach((pid) => console.log(`   🗑  (dry) ${pid}`));
      continue;
    }

    // Ștergere în batch-uri de 100 (limita API Cloudinary)
    for (let i = 0; i < orphans.length; i += 100) {
      const batch = orphans.slice(i, i + 100);
      try {
        await cloudinary.api.delete_resources(batch, { resource_type: resourceType });
        totalDeleted += batch.length;
        console.log(`   ✅ Șterse ${batch.length} asset-uri`);
      } catch (err) {
        console.error(`   ❌ Eroare la ștergere batch:`, err);
      }
    }
  }

  console.log('\n──────────────────────────────────────────');
  if (isDryRun) {
    console.log(`Dry run complet: ${totalOrphans} asset-uri orfane găsite.`);
    console.log('Rulează fără --dry-run pentru a le șterge efectiv.\n');
  } else {
    console.log(`Curățare completă: ${totalDeleted}/${totalOrphans} asset-uri orfane șterse.\n`);
  }
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
