/*
  Warnings:

  - Added the required column `slug` to the `TourPackage` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "TourPackage" ADD COLUMN     "slug" TEXT NOT NULL;
