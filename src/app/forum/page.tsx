import { auth } from "@/lib/auth";
import Link from "next/link";
import { formatRelativeTime, isForumAdmin } from "@/lib/forum-utils";
import { prisma } from "@/lib/prisma";

function Header({ session }: { session: { user?: { name?: string | null; email?: string | null } } | null }) {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-gray-900/80 backdrop-blur-md border-b border-gray-800">
      <div className="max-w-7xl mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <span className="text-xl font-bold text-white">Stats Fetch</span>
          </Link>

          <div className="flex items-center gap-4">
            <Link href="/downloads" className="text-gray-400 hover:text-white transition">
              Download
            </Link>
            <Link href="/forum" className="text-emerald-400 font-medium">
              Forum
            </Link>
            {session?.user ? (
              <Link href="/dashboard" className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-medium transition">
                Dashboard
              </Link>
            ) : (
              <>
                <Link href="/auth/signin" className="text-gray-400 hover:text-white transition">
                  Sign In
                </Link>
                <Link href="/auth/signup" className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-medium transition">
                  Get Started
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}

async function getCategories() {
  try {
    const categories = await prisma.forumCategory.findMany({
      where: { isActive: true },
      orderBy: { displayOrder: "asc" },
      include: {
        _count: {
          select: { topics: true },
        },
        topics: {
          orderBy: {
            lastReplyAt: "desc",
          },
          take: 1,
          select: {
            id: true,
            title: true,
            slug: true,
            lastReplyAt: true,
            authorId: true,
          },
        },
      },
    });

    // Get author info for latest topics
    const categoriesWithAuthors = await Promise.all(
      categories.map(async (cat) => {
        if (cat.topics[0]) {
          const author = await prisma.user.findUnique({
            where: { id: cat.topics[0].authorId },
            select: { id: true, name: true, username: true, image: true },
          });
          return {
            ...cat,
            topics: [{ ...cat.topics[0], author }],
          };
        }
        return { ...cat, topics: [] };
      })
    );

    return { categories: categoriesWithAuthors };
  } catch (error) {
    console.error("Error fetching categories:", error);
    return { categories: [] };
  }
}

export default async function ForumPage() {
  const session = await auth();
  const { categories } = await getCategories();

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      <Header session={session} />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-12">
        {/* Page Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <nav className="flex items-center gap-2 text-sm text-gray-500 mb-2">
              <Link href="/" className="hover:text-emerald-400 transition-colors">
                Home
              </Link>
              <span>/</span>
              <span className="text-white">Forum</span>
            </nav>
            <h1 className="text-3xl font-bold text-white">Community Forum</h1>
            <p className="text-gray-400 mt-2">
              Discuss stats tracking, affiliate programs, and get help from the community
            </p>
          </div>
          {session?.user && (
            <Link
              href="/forum/messages"
              className="bg-emerald-600/20 border border-emerald-500/30 text-emerald-400 px-4 py-2 rounded-lg hover:bg-emerald-600/30 transition flex items-center gap-2"
            >
              💬 Messages
            </Link>
          )}
        </div>

        {/* Sign In Prompt */}
        {!session?.user && (
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4 mb-6">
            <p className="text-blue-300">
              <Link href="/auth/signin" className="font-semibold underline hover:text-blue-200">
                Sign in
              </Link>{" "}
              to create topics, reply to discussions, and send private messages.
            </p>
          </div>
        )}

        {/* Categories */}
        <div className="space-y-4">
          {categories.length === 0 ? (
            <div className="bg-gray-900/50 border border-gray-700 rounded-2xl p-12 text-center">
              <div className="text-5xl mb-4">💬</div>
              <h2 className="text-xl font-bold text-white mb-2">No forum categories yet</h2>
              <p className="text-gray-400">Check back soon for community discussions!</p>
              {session?.user && isForumAdmin(session.user.role) && (
                <Link
                  href="/forum/admin"
                  className="inline-block mt-4 text-emerald-400 hover:text-emerald-300 font-semibold"
                >
                  ⚙️ Create the first category
                </Link>
              )}
            </div>
          ) : (
            categories.map((category) => (
              <Link
                key={category.id}
                href={`/forum/category/${category.slug}`}
                className="block bg-gray-900/50 border border-gray-700 rounded-2xl hover:border-emerald-500/30 transition-all"
              >
                <div className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        {category.icon && (
                          <span className="text-3xl">{category.icon}</span>
                        )}
                        <div>
                          <h2 className="text-xl font-bold text-white hover:text-emerald-400 transition">
                            {category.name}
                          </h2>
                          {category.description && (
                            <p className="text-gray-400 mt-1">
                              {category.description}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="text-right ml-4">
                      <div className="text-sm text-gray-500">
                        <span className="font-semibold text-white">
                          {category._count.topics}
                        </span>{" "}
                        {category._count.topics === 1 ? "topic" : "topics"}
                      </div>
                      {category.topics?.[0] && (
                        <div className="mt-2 text-sm text-gray-400">
                          <div className="font-medium text-gray-300 truncate max-w-xs">
                            {category.topics[0].title}
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            by {category.topics[0].author?.username || category.topics[0].author?.name || "Unknown"} •{" "}
                            {category.topics[0].lastReplyAt
                              ? formatRelativeTime(new Date(category.topics[0].lastReplyAt))
                              : "just now"}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            ))
          )}
        </div>

        {/* New Topic Button */}
        {session?.user && categories.length > 0 && (
          <div className="mt-8 text-center">
            <Link
              href="/forum/new-topic"
              className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-lg font-semibold transition"
            >
              ✏️ Start a New Topic
            </Link>
          </div>
        )}

        {/* Admin Link */}
        {session?.user && isForumAdmin(session.user.role) && (
          <div className="mt-8 text-center">
            <Link
              href="/forum/admin"
              className="text-emerald-400 hover:text-emerald-300 font-semibold"
            >
              ⚙️ Forum Admin Panel
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
