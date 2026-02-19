/*
  Warnings:

  - A unique constraint covering the columns `[slug]` on the table `TourPackage` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "TourPackage_slug_key" ON "TourPackage"("slug");
