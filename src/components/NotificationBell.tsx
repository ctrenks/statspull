"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { formatRelativeTime } from "@/lib/forum-utils";

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
  icon: string | null;
  isRead: boolean;
  createdAt: string;
}

export default function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchNotifications();

    // Refresh every 30 seconds
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchNotifications = async () => {
    try {
      const res = await fetch("/api/notifications?limit=10");
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
        setUnreadCount(data.unreadCount || 0);
      }
    } catch (err) {
      console.error("Failed to fetch notifications:", err);
    }
  };

  const markAsRead = async (notificationId?: string) => {
    try {
      const body = notificationId
        ? { notificationIds: [notificationId] }
        : { markAllRead: true };

      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (notificationId) {
        setNotifications((prev) =>
          prev.map((n) => (n.id === notificationId ? { ...n, isRead: true } : n))
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
      } else {
        setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
        setUnreadCount(0);
      }
    } catch (err) {
      console.error("Failed to mark notifications as read:", err);
    }
  };

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.isRead) {
      markAsRead(notification.id);
    }
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-gray-400 hover:text-white transition-colors"
        aria-label="Notifications"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-6 w-6"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-gray-900 border border-gray-700 rounded-xl shadow-xl z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
            <h3 className="font-semibold text-white">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={() => markAsRead()}
                className="text-xs text-emerald-400 hover:text-emerald-300"
              >
                Mark all read
              </button>
            )}
          </div>

          {/* Notifications List */}
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="p-6 text-center text-gray-500">
                No notifications yet
              </div>
            ) : (
              notifications.map((notification) => (
                <div key={notification.id}>
                  {notification.link ? (
                    <Link
                      href={notification.link}
                      onClick={() => handleNotificationClick(notification)}
                      className={`block px-4 py-3 hover:bg-gray-800/50 transition border-b border-gray-800/50 ${
                        !notification.isRead ? "bg-emerald-500/5" : ""
                      }`}
                    >
                      <div className="flex gap-3">
                        <span className="text-xl">{notification.icon || "🔔"}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`text-sm font-medium ${!notification.isRead ? "text-white" : "text-gray-300"}`}>
                              {notification.title}
                            </span>
                            {!notification.isRead && (
                              <span className="w-2 h-2 bg-emerald-500 rounded-full" />
                            )}
                          </div>
                          <p className="text-xs text-gray-400 truncate">
                            {notification.message}
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            {formatRelativeTime(new Date(notification.createdAt))}
                          </p>
                        </div>
                      </div>
                    </Link>
                  ) : (
                    <div
                      className={`px-4 py-3 border-b border-gray-800/50 ${
                        !notification.isRead ? "bg-emerald-500/5" : ""
                      }`}
                    >
                      <div className="flex gap-3">
                        <span className="text-xl">{notification.icon || "🔔"}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`text-sm font-medium ${!notification.isRead ? "text-white" : "text-gray-300"}`}>
                              {notification.title}
                            </span>
                            {!notification.isRead && (
                              <span className="w-2 h-2 bg-emerald-500 rounded-full" />
                            )}
                          </div>
                          <p className="text-xs text-gray-400">
                            {notification.message}
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            {formatRelativeTime(new Date(notification.createdAt))}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-gray-700 px-4 py-2">
            <Link
              href="/notifications"
              onClick={() => setIsOpen(false)}
              className="block text-center text-sm text-emerald-400 hover:text-emerald-300"
            >
              View all notifications
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

