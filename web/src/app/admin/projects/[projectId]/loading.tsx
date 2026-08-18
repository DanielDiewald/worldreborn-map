import styles from "./loading.module.css";

export default function ProjectLoading(){
  return <main className={styles.shell} aria-busy="true" aria-live="polite" aria-label="Projekt wird geladen">
    <div className={styles.bar}/><div className={styles.title}/><div className={styles.line}/><div className={styles.line} style={{width:"46%"}}/>
    <div className={styles.grid}><div className={styles.card}/><div className={styles.card}/><div className={styles.card}/></div>
  </main>;
}
