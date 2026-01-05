# Stats Fetch

A modern web application for managing API keys for the Stats Fetch stats fetching tool.

🌐 **Domain**: [statsfetch.com](https://statsfetch.com)

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Authentication**: NextAuth v5 with Prisma Adapter
- **Database**: PostgreSQL (Neon via Vercel)
- **ORM**: Prisma
- **Styling**: Tailwind CSS
- **Email**: Resend
- **Deployment**: Vercel

## Features

- 🔐 **User Authentication** - Secure sign up/sign in with credentials
- 🔑 **API Key Management** - Generate, view, and revoke API keys
- 👥 **Role-Based Access** - User (role: 1) and Admin (role: 9) roles
- 📧 **Email Notifications** - Welcome emails and API key notifications via Resend
- 🎨 **Modern UI** - Dark theme with beautiful animations
- 🛡️ **Admin Panel** - User management for administrators

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL database (or Neon account)
- Resend account for emails

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/statsfetch.git
cd statsfetch
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
```

4. Configure your `.env` file:
```env
DATABASE_URL="postgresql://..."
DIRECT_URL="postgresql://..."
AUTH_SECRET="your-secret"
RESEND_API_KEY="re_..."
```

5. Initialize the database:
```bash
npx prisma db push
```

6. Run the development server:
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Database Setup (Neon via Vercel)

1. Create a new project on [Neon](https://neon.tech)
2. Copy the connection strings to your `.env` file
3. Run `npx prisma db push` to create the tables

## User Roles

| Role | Value | Description |
|------|-------|-------------|
| User | 1 | Standard user - can manage their own API key |
| Admin | 9 | Administrator - can manage all users and API keys |

### Creating an Admin User

After creating your first user, you can promote them to admin via Prisma Studio:

```bash
npx prisma studio
```

Then update the user's `role` field to `9`.

## API Key Validation

External services can validate API keys using the validation endpoint:

```bash
POST /api/keys/validate
Content-Type: application/json

{
  "apiKey": "sp_live_..."
}
```

Response:
```json
{
  "valid": true,
  "user": {
    "id": "...",
    "name": "...",
    "email": "...",
    "role": 1
  }
}
```

## Deployment on Vercel

1. Push your code to GitHub
2. Import the repository on Vercel
3. Add environment variables in Vercel dashboard
4. Deploy!

Vercel will automatically:
- Create a Neon PostgreSQL database
- Set up the DATABASE_URL and DIRECT_URL variables
- Run `prisma generate` during build

## Project Structure

```
statsfetch/
├── prisma/
│   └── schema.prisma      # Database schema
├── src/
│   ├── app/
│   │   ├── admin/         # Admin panel
│   │   ├── api/           # API routes
│   │   ├── auth/          # Auth pages
│   │   ├── dashboard/     # User dashboard
│   │   ├── globals.css    # Global styles
│   │   ├── layout.tsx     # Root layout
│   │   └── page.tsx       # Landing page
│   ├── lib/
│   │   ├── api-key.ts     # API key utilities
│   │   ├── auth.ts        # NextAuth config
│   │   ├── email.ts       # Resend email utils
│   │   └── prisma.ts      # Prisma client
│   └── types/
│       └── next-auth.d.ts # NextAuth type extensions
├── .env.example           # Environment template
├── package.json
├── tailwind.config.ts
└── tsconfig.json
```

## License

MIT
