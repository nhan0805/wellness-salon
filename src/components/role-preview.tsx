'use client';

import { useState } from 'react';
import { ChartNoAxesCombined, ListOrdered, Sparkles, WalletCards } from 'lucide-react';

type Tab = 'Overview' | 'Queue' | 'Payments' | 'Services';

export default function RolePreview() {
  const [activeTab, setActiveTab] = useState<Tab>('Overview');

  const tabs: { label: Tab; icon: any }[] = [
    { label: 'Overview', icon: ChartNoAxesCombined },
    { label: 'Queue', icon: ListOrdered },
    { label: 'Payments', icon: WalletCards },
    { label: 'Services', icon: Sparkles },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case 'Overview':
        return (
          <>
            <div className="preview-kpi">
              <div className="preview-card"><small>Revenue status</small><strong>Live</strong></div>
              <div className="preview-card"><small>Queue status</small><strong>Connected</strong></div>
            </div>
            <div className="preview-card">
              <small>Service reporting</small>
              <div className="preview-chart">
                <span className="preview-bar" style={{ height: '48%' }} />
                <span className="preview-bar active" style={{ height: '84%' }} />
                <span className="preview-bar" style={{ height: '64%' }} />
                <span className="preview-bar active" style={{ height: '58%' }} />
                <span className="preview-bar" style={{ height: '72%' }} />
                <span className="preview-bar active" style={{ height: '92%' }} />
              </div>
            </div>
            <div className="preview-card">
              <small>Queue health</small>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, fontSize: '0.76rem' }}>
                <span>Current turn</span><strong style={{ fontSize: '0.86rem' }}>Live queue</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: '0.76rem' }}>
                <span>Next up</span><strong style={{ fontSize: '0.86rem' }}>From database</strong>
              </div>
            </div>
          </>
        );
      case 'Queue':
        return (
          <div className="preview-content" style={{ display: 'grid', gap: '8px' }}>
            {[
              { code: 'A001', name: 'Haku', status: 'In Service' },
              { code: 'A002', name: 'Duyen Ha', status: 'Waiting' },
              { code: 'A003', name: 'Minh Anh', status: 'Waiting' },
            ].map((item) => (
              <div key={item.code} className="preview-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px' }}>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <strong style={{ fontSize: '0.8rem' }}>{item.code}</strong>
                  <span style={{ fontSize: '0.8rem' }}>{item.name}</span>
                </div>
                <span className={`status-badge ${item.status === 'In Service' ? 'status-blue' : 'status-neutral'}`} style={{ fontSize: '0.6rem' }}>{item.status}</span>
              </div>
            ))}
          </div>
        );
      case 'Payments':
        return (
          <div className="preview-content" style={{ display: 'grid', gap: '8px' }}>
            {[
              { id: 'T-101', amount: '$45.00', status: 'Paid' },
              { id: 'T-102', amount: '$120.00', status: 'Pending' },
              { id: 'T-103', amount: '$30.00', status: 'Paid' },
            ].map((item) => (
              <div key={item.id} className="preview-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px' }}>
                <span style={{ fontSize: '0.8rem' }}>{item.id}</span>
                <strong style={{ fontSize: '0.8rem' }}>{item.amount}</strong>
                <span className={`status-badge ${item.status === 'Paid' ? 'status-success' : 'status-warning'}`} style={{ fontSize: '0.6rem' }}>{item.status}</span>
              </div>
            ))}
          </div>
        );
      case 'Services':
        return (
          <div className="preview-content" style={{ display: 'grid', gap: '8px' }}>
            {['Nail Art', 'Gel Manicure', 'Pedicure', 'Full Set'].map((service) => (
              <div key={service} className="preview-card" style={{ padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.8rem' }}>{service}</span>
                <span className="status-badge status-blue" style={{ fontSize: '0.6rem' }}>Active</span>
              </div>
            ))}
          </div>
        );
    }
  };

  return (
    <div className="role-preview" aria-label="Preview of the admin dashboard">
      <div className="role-preview-top">
        <div className="brand">
          <span className="brand-mark"><Sparkles size={15} aria-hidden="true" /></span>
          <span className="brand-copy">Wellness Salon <small>Admin console</small></span>
        </div>
        <span className="status-badge status-success">Live today</span>
      </div>
      <div className="role-preview-body">
        <div className="preview-rail">
          {tabs.map((tab) => (
            <button type="button"
              key={tab.label} 
              className={`preview-nav ${activeTab === tab.label ? 'active' : ''}`} 
              onClick={() => setActiveTab(tab.label)}
            >
              <tab.icon size={15} aria-hidden="true" /> {tab.label}
            </button>
          ))}
        </div>
        <div className="preview-content">
          {renderContent()}
        </div>
      </div>
    </div>
  );
}
