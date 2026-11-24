import { Logo } from '../components/Logo';

// The bare address lists nothing: each retailer has its own link, and one retailer should not see the others.
export default function Home() {
  return (
    <div className="wrap">
      <div className="top"><Logo /></div>
      <div className="section" style={{ gap: 'var(--space-sm)' }}>
        <div className="label">Screen support</div>
        <h1 className="title">Use the link you were given</h1>
      </div>
      <section className="section">
        <p className="body-sm">Each retailer has its own address for raising a screen fault. Open the link the HYPER desk sent you, or call the desk if you can&apos;t find it.</p>
      </section>
      <footer>HYPER Network Operations</footer>
    </div>
  );
}
