"use client";

import { useState } from "react";
import Link from "next/link";

interface SubscribeContentProps {
  isLoggedIn: boolean;
  subscription: {
    status: string;
    endDate: string | null;
    type: string | null;
  } | null;
}

export function SubscribeContent({ isLoggedIn, subscription }: SubscribeContentProps) {
  const [showCryptoModal, setShowCryptoModal] = useState(false);
  const [selectedMonths, setSelectedMonths] = useState(1);

  const isActive = subscription?.status === "ACTIVE" || subscription?.status === "TRIAL";

  const monthlyPrice = 30;
  const yearlyPrice = 300; // ~17% discount
  const yearlyMonthly = (yearlyPrice / 12).toFixed(2);

  const cryptoPrices: Record<number, number> = {
    1: 30,
    3: 85, // ~6% off
    6: 160, // ~11% off
    12: 300, // ~17% off
    24: 540, // ~25% off
  };

  return (
    <div className="space-y-12">
      {/* Active Subscription Banner */}
      {isActive && subscription?.endDate && (
        <div className="card bg-gradient-to-r from-green-900/30 to-dark-900 border-green-500/30">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-green-500/20 flex items-center justify-center">
              <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-bold text-green-400">Subscription Active</h3>
              <p className="text-dark-400">
                Your subscription is active until{" "}
                <strong className="text-white">
                  {new Date(subscription.endDate).toLocaleDateString("en-US", {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                </strong>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Pricing Cards */}
      <div className="grid md:grid-cols-3 gap-8">
        {/* Free Tier */}
        <div className="card border-dark-700">
          <div className="text-center mb-6">
            <h3 className="text-xl font-bold font-display mb-2">Free Trial</h3>
            <div className="text-4xl font-bold mb-1">$0</div>
            <div className="text-dark-400">Forever free</div>
          </div>
          <ul className="space-y-3 mb-8 text-dark-300">
            <li className="flex items-center gap-2">
              <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Up to 5 programs
            </li>
            <li className="flex items-center gap-2">
              <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              All software types
            </li>
            <li className="flex items-center gap-2">
              <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Local data storage
            </li>
            <li className="flex items-center gap-2 text-dark-500">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              Limited to 5 programs
            </li>
          </ul>
          {isLoggedIn ? (
            <Link href="/downloads" className="btn-secondary w-full text-center block">
              Download App
            </Link>
          ) : (
            <Link href="/auth/signin" className="btn-secondary w-full text-center block">
              Get Started
            </Link>
          )}
        </div>

        {/* Monthly */}
        <div className="card border-primary-500/50 relative">
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-primary-500 rounded-full text-sm font-bold">
            Most Popular
          </div>
          <div className="text-center mb-6">
            <h3 className="text-xl font-bold font-display mb-2">Monthly</h3>
            <div className="text-4xl font-bold mb-1">${monthlyPrice}</div>
            <div className="text-dark-400">per month</div>
          </div>
          <ul className="space-y-3 mb-8 text-dark-300">
            <li className="flex items-center gap-2">
              <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <strong className="text-white">Unlimited</strong> programs
            </li>
            <li className="flex items-center gap-2">
              <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              All software types
            </li>
            <li className="flex items-center gap-2">
              <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Priority support
            </li>
            <li className="flex items-center gap-2">
              <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Cancel anytime
            </li>
          </ul>
          {isLoggedIn ? (
            <button
              className="btn-primary w-full"
              onClick={() => alert("PayPal integration coming soon! Use crypto for now.")}
            >
              Subscribe with PayPal
            </button>
          ) : (
            <Link href="/auth/signin" className="btn-primary w-full text-center block">
              Sign In to Subscribe
            </Link>
          )}
        </div>

        {/* Yearly */}
        <div className="card border-dark-700">
          <div className="text-center mb-6">
            <h3 className="text-xl font-bold font-display mb-2">Yearly</h3>
            <div className="text-4xl font-bold mb-1">${yearlyPrice}</div>
            <div className="text-dark-400">${yearlyMonthly}/mo • Save 17%</div>
          </div>
          <ul className="space-y-3 mb-8 text-dark-300">
            <li className="flex items-center gap-2">
              <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <strong className="text-white">Unlimited</strong> programs
            </li>
            <li className="flex items-center gap-2">
              <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              All software types
            </li>
            <li className="flex items-center gap-2">
              <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Priority support
            </li>
            <li className="flex items-center gap-2">
              <svg className="w-5 h-5 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              2 months free
            </li>
          </ul>
          {isLoggedIn ? (
            <button
              className="btn-secondary w-full"
              onClick={() => alert("PayPal integration coming soon! Use crypto for now.")}
            >
              Subscribe Yearly
            </button>
          ) : (
            <Link href="/auth/signin" className="btn-secondary w-full text-center block">
              Sign In to Subscribe
            </Link>
          )}
        </div>
      </div>

      {/* Crypto Payment Option */}
      <div className="card bg-gradient-to-br from-orange-900/20 to-dark-900 border-orange-500/30">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-orange-500/20 flex items-center justify-center text-3xl">
              ₿
            </div>
            <div>
              <h3 className="text-xl font-bold font-display">Pay with Crypto</h3>
              <p className="text-dark-400">
                Bitcoin, Ethereum, USDT, and more. Get up to 25% off on longer plans.
              </p>
            </div>
          </div>
          <button
            className="btn-primary bg-orange-600 hover:bg-orange-500 whitespace-nowrap"
            onClick={() => setShowCryptoModal(true)}
          >
            Pay with Crypto
          </button>
        </div>
      </div>

      {/* Crypto Modal */}
      {showCryptoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="card max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold font-display">Crypto Payment</h2>
              <button
                onClick={() => setShowCryptoModal(false)}
                className="text-dark-400 hover:text-white"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <p className="text-dark-400 mb-6">
              Select your subscription length and follow the instructions to pay with cryptocurrency.
            </p>

            {/* Duration Selection */}
            <div className="space-y-3 mb-6">
              {Object.entries(cryptoPrices).map(([months, price]) => (
                <label
                  key={months}
                  className={`flex items-center justify-between p-4 rounded-lg border-2 cursor-pointer transition-all ${
                    selectedMonths === Number(months)
                      ? "border-primary-500 bg-primary-500/10"
                      : "border-dark-700 hover:border-dark-600"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="months"
                      value={months}
                      checked={selectedMonths === Number(months)}
                      onChange={() => setSelectedMonths(Number(months))}
                      className="sr-only"
                    />
                    <span className="font-medium">
                      {months} {Number(months) === 1 ? "Month" : "Months"}
                    </span>
                    {Number(months) > 1 && (
                      <span className="text-xs px-2 py-0.5 rounded bg-green-500/20 text-green-400">
                        Save {Math.round((1 - price / (Number(months) * 25)) * 100)}%
                      </span>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-primary-400">${price}</div>
                    <div className="text-xs text-dark-400">${(price / Number(months)).toFixed(2)}/mo</div>
                  </div>
                </label>
              ))}
            </div>

            {/* Instructions */}
            <div className="bg-dark-800 rounded-lg p-4 mb-6">
              <h4 className="font-bold mb-3">How to Pay:</h4>
              <ol className="space-y-2 text-dark-300 text-sm list-decimal list-inside">
                <li>Contact us via email or forum with your payment choice</li>
                <li>We&apos;ll send you the wallet address for your chosen crypto</li>
                <li>Send exactly <strong className="text-white">${cryptoPrices[selectedMonths]}</strong> worth</li>
                <li>Reply with the transaction ID/hash</li>
                <li>We&apos;ll activate your subscription within 24 hours</li>
              </ol>
            </div>

            <div className="flex gap-4">
              <a
                href={`mailto:support@statsfetch.com?subject=Crypto Payment Request&body=I would like to pay with crypto for a subscription.%0A%0APlan: ${selectedMonths} months ($${cryptoPrices[selectedMonths]})%0A%0AMy username: `}
                className="btn-primary flex-1 text-center"
              >
                Contact via Email
              </a>
              <button
                onClick={() => setShowCryptoModal(false)}
                className="btn-secondary"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FAQ */}
      <div className="card">
        <h2 className="text-2xl font-bold font-display mb-6">Frequently Asked Questions</h2>
        <div className="space-y-6">
          <div>
            <h4 className="font-bold text-white mb-2">What happens when my subscription expires?</h4>
            <p className="text-dark-400">
              You&apos;ll keep all your data, but only your first 5 programs will be able to sync.
              Resubscribe anytime to restore full access.
            </p>
          </div>
          <div>
            <h4 className="font-bold text-white mb-2">Can I cancel anytime?</h4>
            <p className="text-dark-400">
              Yes! PayPal subscriptions can be cancelled anytime. You&apos;ll keep access until your paid period ends.
            </p>
          </div>
          <div>
            <h4 className="font-bold text-white mb-2">What cryptocurrencies do you accept?</h4>
            <p className="text-dark-400">
              We accept Bitcoin (BTC), Ethereum (ETH), USDT, USDC, and most major cryptocurrencies.
            </p>
          </div>
          <div>
            <h4 className="font-bold text-white mb-2">Is there a refund policy?</h4>
            <p className="text-dark-400">
              We offer refunds within 7 days if you&apos;re not satisfied. Contact support for assistance.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
