import { auth } from "@/lib/auth";
import Link from "next/link";
import { formatRelativeTime, isForumAdmin } from "@/lib/forum-utils";
import { prisma } from "@/lib/prisma";

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
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 py-12">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
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
