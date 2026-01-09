"use client";

import { useState } from "react";

interface Referral {
  id: string;
  email: string;
  createdAt: Date;
  subscriptionStatus: string;
}

interface Commission {
  id: string;
  amount: number;
  rate: number;
  createdAt: Date;
  isPaid: boolean;
  payment: {
    amount: number;
    type: string;
  };
}

interface AffiliateContentProps {
  user: {
    referralCode: string;
    affiliateBalance: number;
    totalEarnings: number;
    referrals: Referral[];
    commissionsEarned: Commission[];
  };
  commissionRate: number;
}

export function AffiliateContent({ user, commissionRate }: AffiliateContentProps) {
  const [copied, setCopied] = useState(false);
  
  const referralLink = `https://www.statsfetch.com/?ref=${user.referralCode}`;

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const formatCurrency = (cents: number) => {
    return (cents / 100).toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
    });
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <div className="space-y-8">
      {/* Stats Cards */}
      <div className="grid md:grid-cols-4 gap-6">
        <div className="card">
          <div className="text-dark-400 text-sm mb-2">Available Balance</div>
          <div className="text-3xl font-bold text-primary-400">
            {formatCurrency(user.affiliateBalance)}
          </div>
          <div className="text-dark-500 text-xs mt-1">Unpaid commissions</div>
        </div>
        
        <div className="card">
          <div className="text-dark-400 text-sm mb-2">Total Earned</div>
          <div className="text-3xl font-bold text-green-400">
            {formatCurrency(user.totalEarnings)}
          </div>
          <div className="text-dark-500 text-xs mt-1">Lifetime earnings</div>
        </div>
        
        <div className="card">
          <div className="text-dark-400 text-sm mb-2">Total Referrals</div>
          <div className="text-3xl font-bold text-white">
            {user.referrals.length}
          </div>
          <div className="text-dark-500 text-xs mt-1">Users signed up</div>
        </div>
        
        <div className="card">
          <div className="text-dark-400 text-sm mb-2">Commission Rate</div>
          <div className="text-3xl font-bold text-yellow-400">
            {(commissionRate * 100).toFixed(0)}%
          </div>
          <div className="text-dark-500 text-xs mt-1">Per subscription</div>
        </div>
      </div>

      {/* Referral Link */}
      <div className="card">
        <h2 className="text-xl font-bold font-display mb-4">Your Referral Link</h2>
        <p className="text-dark-400 mb-4">
          Share this link with others. When they sign up and subscribe, you earn {(commissionRate * 100).toFixed(0)}% of their payment!
        </p>
        
        <div className="flex gap-3">
          <div className="flex-1 bg-dark-800 rounded-lg px-4 py-3 font-mono text-sm text-primary-400 overflow-x-auto">
            {referralLink}
          </div>
          <button
            onClick={copyToClipboard}
            className={`btn-primary px-6 whitespace-nowrap ${copied ? "bg-green-600" : ""}`}
          >
            {copied ? (
              <>
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Copied!
              </>
            ) : (
              <>
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                Copy Link
              </>
            )}
          </button>
        </div>
        
        <div className="mt-4 p-4 bg-dark-800/50 rounded-lg">
          <div className="flex items-center gap-2 text-dark-400 text-sm">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>Your referral code: <strong className="text-white font-mono">{user.referralCode}</strong></span>
          </div>
        </div>
      </div>

      {/* Recent Commissions */}
      <div className="card">
        <h2 className="text-xl font-bold font-display mb-4">Recent Commissions</h2>
        
        {user.commissionsEarned.length === 0 ? (
          <div className="text-center py-12 text-dark-400">
            <svg className="w-12 h-12 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p>No commissions yet. Share your referral link to start earning!</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-dark-400 text-sm border-b border-dark-700">
                  <th className="pb-3 font-medium">Date</th>
                  <th className="pb-3 font-medium">Type</th>
                  <th className="pb-3 font-medium">Sale Amount</th>
                  <th className="pb-3 font-medium">Your Commission</th>
                  <th className="pb-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-700">
                {user.commissionsEarned.map((commission) => (
                  <tr key={commission.id}>
                    <td className="py-4 text-dark-300">{formatDate(commission.createdAt)}</td>
                    <td className="py-4">
                      <span className="px-2 py-1 rounded text-xs bg-dark-700 text-dark-300">
                        {commission.payment.type.replace("_", " ")}
                      </span>
                    </td>
                    <td className="py-4 text-dark-300">{formatCurrency(commission.payment.amount)}</td>
                    <td className="py-4 text-green-400 font-medium">{formatCurrency(commission.amount)}</td>
                    <td className="py-4">
                      {commission.isPaid ? (
                        <span className="px-2 py-1 rounded text-xs bg-green-500/20 text-green-400">Paid</span>
                      ) : (
                        <span className="px-2 py-1 rounded text-xs bg-yellow-500/20 text-yellow-400">Pending</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Referrals List */}
      <div className="card">
        <h2 className="text-xl font-bold font-display mb-4">Your Referrals</h2>
        
        {user.referrals.length === 0 ? (
          <div className="text-center py-12 text-dark-400">
            <svg className="w-12 h-12 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <p>No referrals yet. Share your link to get started!</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-dark-400 text-sm border-b border-dark-700">
                  <th className="pb-3 font-medium">Email</th>
                  <th className="pb-3 font-medium">Joined</th>
                  <th className="pb-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-700">
                {user.referrals.map((referral) => (
                  <tr key={referral.id}>
                    <td className="py-4 text-dark-300">
                      {referral.email.replace(/(.{2})(.*)(@.*)/, "$1***$3")}
                    </td>
                    <td className="py-4 text-dark-400">{formatDate(referral.createdAt)}</td>
                    <td className="py-4">
                      {referral.subscriptionStatus === "ACTIVE" ? (
                        <span className="px-2 py-1 rounded text-xs bg-green-500/20 text-green-400">Subscribed</span>
                      ) : (
                        <span className="px-2 py-1 rounded text-xs bg-dark-700 text-dark-400">Free</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Payout Info */}
      <div className="card bg-gradient-to-br from-primary-900/20 to-dark-900">
        <h2 className="text-xl font-bold font-display mb-4">💰 Getting Paid</h2>
        <div className="space-y-3 text-dark-300">
          <p>• Minimum payout: <strong className="text-white">$50.00</strong></p>
          <p>• Payouts processed manually via crypto or PayPal</p>
          <p>• Contact us when you&apos;re ready for payout</p>
          <p>• Commissions are earned when referred users make their first payment</p>
        </div>
      </div>
    </div>
  );
}

