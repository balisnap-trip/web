# Stage 1: build
FROM node:18-bullseye AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install --legacy-peer-deps

# Copy source code
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build Next.js
RUN npm run build

# Stage 2: production
FROM node:18-bullseye

WORKDIR /app

# Copy built app and node_modules
COPY --from=builder /app ./

# Set environment variables
ENV NODE_ENV=production

# Expose port 5000
EXPOSE 5000

# Run Next.js in production
CMD ["npm", "run", "start", "--", "-H", "0.0.0.0", "-p", "5000"]
