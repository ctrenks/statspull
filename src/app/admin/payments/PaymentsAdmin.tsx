"use client";

import { useState } from "react";

interface Payment {
  id: string;
  userId: string;
  amount: number;
  status: string;
  type: string;
  months: number;
  notes: string | null;
  createdAt: Date;
  user: {
    email: string;
    username: string | null;
  };
}

interface User {
  id: string;
  email: string;
  username: string | null;
  subscriptionStatus: string;
  subscriptionEndDate: Date | null;
  createdAt: Date;
}

interface AffiliateSettings {
  id: string;
  tier1CommissionRate: number;
  minPayoutAmount: number;
  cookieDurationDays: number;
}

interface PaymentsAdminProps {
  pendingPayments: Payment[];
  recentPayments: Payment[];
  usersNeedingSub: User[];
  affiliateSettings: AffiliateSettings;
}

export function PaymentsAdmin({
  pendingPayments: initialPending,
  recentPayments: initialRecent,
  usersNeedingSub,
  affiliateSettings: initialSettings,
}: PaymentsAdminProps) {
  const [pendingPayments, setPendingPayments] = useState(initialPending);
  const [recentPayments, setRecentPayments] = useState(initialRecent);
  const [settings, setSettings] = useState(initialSettings);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [months, setMonths] = useState(1);
  const [amount, setAmount] = useState(25);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"pending" | "add" | "settings">("add");

  const formatCurrency = (cents: number) => {
    return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const addSubscription = async () => {
    if (!selectedUser) return;
    setLoading(true);

    try {
      const res = await fetch("/api/admin/subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: selectedUser.id,
          months,
          amount: amount * 100, // Convert to cents
          type: "CRYPTO",
          notes,
        }),
      });

      if (res.ok) {
        alert(`Added ${months} month(s) subscription to ${selectedUser.email}`);
        setSelectedUser(null);
        setMonths(1);
        setAmount(25);
        setNotes("");
        window.location.reload();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to add subscription");
      }
    } catch (error) {
      alert("Error adding subscription");
    } finally {
      setLoading(false);
    }
  };

  const approvePayment = async (paymentId: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/payments/${paymentId}/approve`, {
        method: "POST",
      });

      if (res.ok) {
        setPendingPayments((prev) => prev.filter((p) => p.id !== paymentId));
        window.location.reload();
      } else {
        alert("Failed to approve payment");
      }
    } catch (error) {
      alert("Error approving payment");
    } finally {
      setLoading(false);
    }
  };

  const updateSettings = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/affiliate-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });

      if (res.ok) {
        alert("Settings updated!");
      } else {
        alert("Failed to update settings");
      }
    } catch (error) {
      alert("Error updating settings");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Tabs */}
      <div className="flex gap-4 border-b border-dark-700 pb-4">
        <button
          onClick={() => setTab("add")}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            tab === "add" ? "bg-primary-500 text-white" : "text-dark-400 hover:text-white"
          }`}
        >
          Add Subscription
        </button>
        <button
          onClick={() => setTab("pending")}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            tab === "pending" ? "bg-primary-500 text-white" : "text-dark-400 hover:text-white"
          }`}
        >
          Pending ({pendingPayments.length})
        </button>
        <button
          onClick={() => setTab("settings")}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            tab === "settings" ? "bg-primary-500 text-white" : "text-dark-400 hover:text-white"
          }`}
        >
          Affiliate Settings
        </button>
      </div>

      {/* Add Subscription Tab */}
      {tab === "add" && (
        <div className="card">
          <h2 className="text-xl font-bold font-display mb-6">Add Subscription (Manual/Crypto)</h2>

          <div className="grid md:grid-cols-2 gap-8">
            {/* User Selection */}
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-2">
                Select User
              </label>
              <div className="max-h-80 overflow-y-auto bg-dark-800 rounded-lg divide-y divide-dark-700">
                {usersNeedingSub.map((user) => (
                  <button
                    key={user.id}
                    onClick={() => setSelectedUser(user)}
                    className={`w-full text-left px-4 py-3 hover:bg-dark-700 transition-colors ${
                      selectedUser?.id === user.id ? "bg-primary-500/20 border-l-4 border-primary-500" : ""
                    }`}
                  >
                    <div className="font-medium text-white">{user.username || user.email}</div>
                    <div className="text-sm text-dark-400">{user.email}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Subscription Details */}
            <div className="space-y-6">
              {selectedUser && (
                <>
                  <div className="p-4 bg-dark-800 rounded-lg">
                    <div className="text-sm text-dark-400 mb-1">Selected User</div>
                    <div className="font-bold text-lg">{selectedUser.username || selectedUser.email}</div>
                    <div className="text-dark-400 text-sm">{selectedUser.email}</div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-dark-300 mb-2">
                      Months to Add
                    </label>
                    <select
                      value={months}
                      onChange={(e) => {
                        const m = Number(e.target.value);
                        setMonths(m);
                        // Auto-calculate price
                        const prices: Record<number, number> = { 1: 30, 3: 85, 6: 160, 12: 300, 24: 540 };
                        setAmount(prices[m] || m * 25);
                      }}
                      className="w-full bg-dark-800 border border-dark-700 rounded-lg px-4 py-3"
                    >
                      <option value={1}>1 Month</option>
                      <option value={3}>3 Months</option>
                      <option value={6}>6 Months</option>
                      <option value={12}>12 Months (1 Year)</option>
                      <option value={24}>24 Months (2 Years)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-dark-300 mb-2">
                      Payment Amount ($)
                    </label>
                    <input
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(Number(e.target.value))}
                      className="w-full bg-dark-800 border border-dark-700 rounded-lg px-4 py-3"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-dark-300 mb-2">
                      Notes (optional)
                    </label>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Transaction hash, payment method, etc."
                      className="w-full bg-dark-800 border border-dark-700 rounded-lg px-4 py-3 h-24"
                    />
                  </div>

                  <button
                    onClick={addSubscription}
                    disabled={loading}
                    className="btn-primary w-full"
                  >
                    {loading ? "Processing..." : `Add ${months} Month(s) Subscription`}
                  </button>
                </>
              )}

              {!selectedUser && (
                <div className="text-center text-dark-400 py-12">
                  Select a user from the list to add subscription time
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Pending Payments Tab */}
      {tab === "pending" && (
        <div className="card">
          <h2 className="text-xl font-bold font-display mb-6">Pending Payments</h2>

          {pendingPayments.length === 0 ? (
            <div className="text-center text-dark-400 py-12">No pending payments</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-dark-400 text-sm border-b border-dark-700">
                    <th className="pb-3">User</th>
                    <th className="pb-3">Amount</th>
                    <th className="pb-3">Months</th>
                    <th className="pb-3">Type</th>
                    <th className="pb-3">Date</th>
                    <th className="pb-3">Notes</th>
                    <th className="pb-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-dark-700">
                  {pendingPayments.map((payment) => (
                    <tr key={payment.id}>
                      <td className="py-4">
                        <div className="font-medium">{payment.user.username || payment.user.email}</div>
                        <div className="text-sm text-dark-400">{payment.user.email}</div>
                      </td>
                      <td className="py-4 font-medium">{formatCurrency(payment.amount)}</td>
                      <td className="py-4">{payment.months}</td>
                      <td className="py-4">
                        <span className="px-2 py-1 bg-orange-500/20 text-orange-400 rounded text-xs">
                          {payment.type}
                        </span>
                      </td>
                      <td className="py-4 text-dark-400">{formatDate(payment.createdAt)}</td>
                      <td className="py-4 text-dark-400 text-sm max-w-xs truncate">
                        {payment.notes || "-"}
                      </td>
                      <td className="py-4">
                        <button
                          onClick={() => approvePayment(payment.id)}
                          disabled={loading}
                          className="btn-primary text-sm py-1 px-3"
                        >
                          Approve
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Affiliate Settings Tab */}
      {tab === "settings" && (
        <div className="card max-w-xl">
          <h2 className="text-xl font-bold font-display mb-6">Affiliate Settings</h2>

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-2">
                Tier 1 Commission Rate (%)
              </label>
              <input
                type="number"
                step="0.01"
                value={settings.tier1CommissionRate * 100}
                onChange={(e) =>
                  setSettings({ ...settings, tier1CommissionRate: Number(e.target.value) / 100 })
                }
                className="w-full bg-dark-800 border border-dark-700 rounded-lg px-4 py-3"
              />
              <p className="text-dark-500 text-sm mt-1">e.g., 15 for 15%</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-dark-300 mb-2">
                Minimum Payout ($)
              </label>
              <input
                type="number"
                value={settings.minPayoutAmount / 100}
                onChange={(e) =>
                  setSettings({ ...settings, minPayoutAmount: Number(e.target.value) * 100 })
                }
                className="w-full bg-dark-800 border border-dark-700 rounded-lg px-4 py-3"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-dark-300 mb-2">
                Cookie Duration (days)
              </label>
              <input
                type="number"
                value={settings.cookieDurationDays}
                onChange={(e) =>
                  setSettings({ ...settings, cookieDurationDays: Number(e.target.value) })
                }
                className="w-full bg-dark-800 border border-dark-700 rounded-lg px-4 py-3"
              />
            </div>

            <button onClick={updateSettings} disabled={loading} className="btn-primary">
              {loading ? "Saving..." : "Save Settings"}
            </button>
          </div>
        </div>
      )}

      {/* Recent Payments */}
      <div className="card">
        <h2 className="text-xl font-bold font-display mb-6">Recent Payments</h2>

        {recentPayments.length === 0 ? (
          <div className="text-center text-dark-400 py-8">No payment history</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-dark-400 text-sm border-b border-dark-700">
                  <th className="pb-3">User</th>
                  <th className="pb-3">Amount</th>
                  <th className="pb-3">Months</th>
                  <th className="pb-3">Type</th>
                  <th className="pb-3">Status</th>
                  <th className="pb-3">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-700">
                {recentPayments.map((payment) => (
                  <tr key={payment.id}>
                    <td className="py-3">
                      <div className="font-medium">{payment.user.username || payment.user.email}</div>
                    </td>
                    <td className="py-3">{formatCurrency(payment.amount)}</td>
                    <td className="py-3">{payment.months}</td>
                    <td className="py-3 text-sm text-dark-400">{payment.type}</td>
                    <td className="py-3">
                      <span
                        className={`px-2 py-1 rounded text-xs ${
                          payment.status === "COMPLETED"
                            ? "bg-green-500/20 text-green-400"
                            : payment.status === "FAILED"
                            ? "bg-red-500/20 text-red-400"
                            : "bg-yellow-500/20 text-yellow-400"
                        }`}
                      >
                        {payment.status}
                      </span>
                    </td>
                    <td className="py-3 text-dark-400">{formatDate(payment.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
