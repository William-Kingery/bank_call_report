import Link from 'next/link';
import styles from '../styles/NationalAverages.module.css';

const NationalAverages = () => {
  return (
    <main className={styles.main}>
      <div className={styles.header}>
        <p className={styles.kicker}>National Averages</p>
        <h1 className={styles.title}>Peer Group Trends Overview</h1>
        <p className={styles.subtitle}>
          This page provides a quick way to return to the National Averages and Peer Group Trends
          dashboard.
        </p>
        <Link className={styles.backButton} href="/">
          Back to National Averages and Peer Group Trends
        </Link>
      </div>
    </main>
  );
};

export default NationalAverages;
