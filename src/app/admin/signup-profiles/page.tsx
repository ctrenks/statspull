'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface SignupProfile {
  id: string;
  name: string;
  isDefault: boolean;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  companyName: string | null;
  website: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string;
  zipCode: string | null;
  username: string | null;
  password: string | null;
  skype: string | null;
  telegram: string | null;
  discord: string | null;
  trafficSources: string | null;
  monthlyVisitors: string | null;
  promotionMethods: string | null;
  comments: string | null;
}

const emptyProfile: Partial<SignupProfile> = {
  name: 'Default',
  isDefault: true,
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  companyName: '',
  website: '',
  address: '',
  city: '',
  state: '',
  country: 'US',
  zipCode: '',
  username: '',
  password: '',
  skype: '',
  telegram: '',
  discord: '',
  trafficSources: '',
  monthlyVisitors: '',
  promotionMethods: '',
  comments: '',
};

export default function SignupProfilesPage() {
  const [profiles, setProfiles] = useState<SignupProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingProfile, setEditingProfile] = useState<Partial<SignupProfile> | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadProfiles();
  }, []);

  const loadProfiles = async () => {
    try {
      const res = await fetch('/api/admin/signup-profile');
      const data = await res.json();
      setProfiles(data.profiles || []);
    } catch (error) {
      console.error('Failed to load profiles:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveProfile = async () => {
    if (!editingProfile) return;
    setSaving(true);

    try {
      const method = editingProfile.id ? 'PATCH' : 'POST';
      const res = await fetch('/api/admin/signup-profile', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingProfile),
      });

      if (res.ok) {
        await loadProfiles();
        setEditingProfile(null);
      }
    } catch (error) {
      console.error('Failed to save profile:', error);
    } finally {
      setSaving(false);
    }
  };

  const deleteProfile = async (id: string) => {
    if (!confirm('Delete this profile?')) return;

    try {
      await fetch(`/api/admin/signup-profile?id=${id}`, { method: 'DELETE' });
      await loadProfiles();
    } catch (error) {
      console.error('Failed to delete profile:', error);
    }
  };

  const setAsDefault = async (id: string) => {
    try {
      await fetch('/api/admin/signup-profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, isDefault: true }),
      });
      await loadProfiles();
    } catch (error) {
      console.error('Failed to set default:', error);
    }
  };

  if (loading) {
    return <div className="p-8 text-center">Loading...</div>;
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Signup Profiles</h1>
          <p className="text-dark-400 mt-2">
            Manage your affiliate signup details for auto-registration
          </p>
        </div>
        <Link href="/admin" className="btn-ghost">← Back to Admin</Link>
      </div>

      {/* Profile List */}
      {!editingProfile && (
        <div className="space-y-4">
          {profiles.length === 0 ? (
            <div className="card p-8 text-center">
              <p className="text-dark-400 mb-4">No signup profiles yet</p>
              <button
                onClick={() => setEditingProfile(emptyProfile)}
                className="btn-primary"
              >
                Create Your First Profile
              </button>
            </div>
          ) : (
            <>
              {profiles.map((profile) => (
                <div key={profile.id} className="card p-6">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-xl font-semibold">{profile.name}</h3>
                        {profile.isDefault && (
                          <span className="px-2 py-1 bg-green-500/20 text-green-400 text-xs rounded">
                            Default
                          </span>
                        )}
                      </div>
                      <div className="mt-2 text-sm text-dark-400 space-y-1">
                        <p><strong>Name:</strong> {profile.firstName} {profile.lastName}</p>
                        <p><strong>Email:</strong> {profile.email}</p>
                        <p><strong>Company:</strong> {profile.companyName}</p>
                        <p><strong>Website:</strong> {profile.website}</p>
                        <p><strong>Location:</strong> {profile.city}, {profile.state} {profile.country}</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {!profile.isDefault && (
                        <button
                          onClick={() => setAsDefault(profile.id)}
                          className="btn-ghost text-sm"
                        >
                          Set Default
                        </button>
                      )}
                      <button
                        onClick={() => setEditingProfile(profile)}
                        className="btn-ghost text-sm"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => deleteProfile(profile.id)}
                        className="text-red-400 hover:text-red-300 text-sm"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              <button
                onClick={() => setEditingProfile(emptyProfile)}
                className="btn-primary w-full"
              >
                + Add Another Profile
              </button>
            </>
          )}
        </div>
      )}

      {/* Edit Form */}
      {editingProfile && (
        <div className="card p-6">
          <h2 className="text-xl font-semibold mb-6">
            {editingProfile.id ? 'Edit Profile' : 'Create Profile'}
          </h2>

          <div className="space-y-6">
            {/* Profile Name */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Profile Name</label>
                <input
                  type="text"
                  value={editingProfile.name || ''}
                  onChange={(e) => setEditingProfile({ ...editingProfile, name: e.target.value })}
                  className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded"
                  placeholder="e.g., Main, Business, Personal"
                />
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingProfile.isDefault || false}
                    onChange={(e) => setEditingProfile({ ...editingProfile, isDefault: e.target.checked })}
                  />
                  <span>Set as default profile</span>
                </label>
              </div>
            </div>

            {/* Personal Info */}
            <div>
              <h3 className="text-lg font-medium mb-3 text-primary-400">Personal Info</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">First Name *</label>
                  <input
                    type="text"
                    value={editingProfile.firstName || ''}
                    onChange={(e) => setEditingProfile({ ...editingProfile, firstName: e.target.value })}
                    className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Last Name *</label>
                  <input
                    type="text"
                    value={editingProfile.lastName || ''}
                    onChange={(e) => setEditingProfile({ ...editingProfile, lastName: e.target.value })}
                    className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Email *</label>
                  <input
                    type="email"
                    value={editingProfile.email || ''}
                    onChange={(e) => setEditingProfile({ ...editingProfile, email: e.target.value })}
                    className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Phone</label>
                  <input
                    type="tel"
                    value={editingProfile.phone || ''}
                    onChange={(e) => setEditingProfile({ ...editingProfile, phone: e.target.value })}
                    className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded"
                  />
                </div>
              </div>
            </div>

            {/* Company Info */}
            <div>
              <h3 className="text-lg font-medium mb-3 text-primary-400">Company Info</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Company Name</label>
                  <input
                    type="text"
                    value={editingProfile.companyName || ''}
                    onChange={(e) => setEditingProfile({ ...editingProfile, companyName: e.target.value })}
                    className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Website</label>
                  <input
                    type="url"
                    value={editingProfile.website || ''}
                    onChange={(e) => setEditingProfile({ ...editingProfile, website: e.target.value })}
                    className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded"
                    placeholder="https://"
                  />
                </div>
              </div>
            </div>

            {/* Address */}
            <div>
              <h3 className="text-lg font-medium mb-3 text-primary-400">Address</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium mb-2">Street Address</label>
                  <input
                    type="text"
                    value={editingProfile.address || ''}
                    onChange={(e) => setEditingProfile({ ...editingProfile, address: e.target.value })}
                    className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">City</label>
                  <input
                    type="text"
                    value={editingProfile.city || ''}
                    onChange={(e) => setEditingProfile({ ...editingProfile, city: e.target.value })}
                    className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">State/Province</label>
                  <input
                    type="text"
                    value={editingProfile.state || ''}
                    onChange={(e) => setEditingProfile({ ...editingProfile, state: e.target.value })}
                    className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Country</label>
                  <input
                    type="text"
                    value={editingProfile.country || 'US'}
                    onChange={(e) => setEditingProfile({ ...editingProfile, country: e.target.value })}
                    className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Zip/Postal Code</label>
                  <input
                    type="text"
                    value={editingProfile.zipCode || ''}
                    onChange={(e) => setEditingProfile({ ...editingProfile, zipCode: e.target.value })}
                    className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded"
                  />
                </div>
              </div>
            </div>

            {/* Account Credentials */}
            <div>
              <h3 className="text-lg font-medium mb-3 text-primary-400">Account Credentials</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Preferred Username</label>
                  <input
                    type="text"
                    value={editingProfile.username || ''}
                    onChange={(e) => setEditingProfile({ ...editingProfile, username: e.target.value })}
                    className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Password</label>
                  <input
                    type="password"
                    value={editingProfile.password || ''}
                    onChange={(e) => setEditingProfile({ ...editingProfile, password: e.target.value })}
                    className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded"
                  />
                </div>
              </div>
            </div>

            {/* Messaging */}
            <div>
              <h3 className="text-lg font-medium mb-3 text-primary-400">Messaging</h3>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Skype</label>
                  <input
                    type="text"
                    value={editingProfile.skype || ''}
                    onChange={(e) => setEditingProfile({ ...editingProfile, skype: e.target.value })}
                    className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Telegram</label>
                  <input
                    type="text"
                    value={editingProfile.telegram || ''}
                    onChange={(e) => setEditingProfile({ ...editingProfile, telegram: e.target.value })}
                    className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Discord</label>
                  <input
                    type="text"
                    value={editingProfile.discord || ''}
                    onChange={(e) => setEditingProfile({ ...editingProfile, discord: e.target.value })}
                    className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded"
                  />
                </div>
              </div>
            </div>

            {/* Marketing */}
            <div>
              <h3 className="text-lg font-medium mb-3 text-primary-400">Marketing Info</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Traffic Sources</label>
                  <input
                    type="text"
                    value={editingProfile.trafficSources || ''}
                    onChange={(e) => setEditingProfile({ ...editingProfile, trafficSources: e.target.value })}
                    className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded"
                    placeholder="e.g., SEO, PPC, Social Media"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Monthly Visitors</label>
                  <input
                    type="text"
                    value={editingProfile.monthlyVisitors || ''}
                    onChange={(e) => setEditingProfile({ ...editingProfile, monthlyVisitors: e.target.value })}
                    className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded"
                    placeholder="e.g., 10,000-50,000"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium mb-2">Promotion Methods</label>
                  <input
                    type="text"
                    value={editingProfile.promotionMethods || ''}
                    onChange={(e) => setEditingProfile({ ...editingProfile, promotionMethods: e.target.value })}
                    className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded"
                    placeholder="e.g., Website, Email Marketing, Social Media"
                  />
                </div>
              </div>
            </div>

            {/* Comments */}
            <div>
              <label className="block text-sm font-medium mb-2">Additional Comments</label>
              <textarea
                value={editingProfile.comments || ''}
                onChange={(e) => setEditingProfile({ ...editingProfile, comments: e.target.value })}
                className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded h-24"
                placeholder="Any additional info you want to include in signups..."
              />
            </div>

            {/* Buttons */}
            <div className="flex gap-4 pt-4">
              <button
                onClick={saveProfile}
                disabled={saving}
                className="btn-primary flex-1"
              >
                {saving ? 'Saving...' : 'Save Profile'}
              </button>
              <button
                onClick={() => setEditingProfile(null)}
                className="btn-ghost flex-1"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
