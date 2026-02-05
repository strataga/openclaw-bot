FROM node:22-slim

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy source code
COPY . .

# Expose health check port
EXPOSE 3000

# Start the bot
CMD ["npm", "start"]
