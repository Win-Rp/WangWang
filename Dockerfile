# Use node:20 as the base image
FROM node:20

# Create app directory
WORKDIR /app

# Install build essentials for native modules like sqlite3
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Expose ports for Vite (5173) and Backend (3001)
EXPOSE 5173 3001

# The actual code will be mounted at runtime
# But we can set a default command to run
CMD ["sh", "-c", "npm install && npm run dev"]
