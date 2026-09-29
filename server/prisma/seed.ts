import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  await prisma.podesavanja.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
  console.log('Podrazumevana podešavanja su upisana (plac 500-7000 m² do 26.000 €, kuće do 70.000 € sa placem >= 700 m²).');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
