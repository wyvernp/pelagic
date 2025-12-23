use rusqlite::Connection;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let db_path = std::env::args().nth(1).unwrap_or_else(|| "pelagic.db".to_string());
    println!("Opening database: {}", db_path);
    
    let conn = Connection::open(&db_path)?;
    
    // Count dive_tanks
    let tank_count: i64 = conn.query_row("SELECT COUNT(*) FROM dive_tanks", [], |row| row.get(0))?;
    println!("Total dive_tanks records: {}", tank_count);
    
    // Show all dive_tanks with gas mix info
    let mut stmt = conn.prepare("SELECT dt.dive_id, dt.sensor_id, dt.gas_index, dt.o2_percent, dt.he_percent, dt.start_pressure_bar, dt.end_pressure_bar, d.date, d.time 
                                  FROM dive_tanks dt 
                                  JOIN dives d ON d.id = dt.dive_id 
                                  ORDER BY d.date DESC, d.time DESC 
                                  LIMIT 20")?;
    
    let rows = stmt.query_map([], |row| {
        Ok((
            row.get::<_, i64>(0)?,           // dive_id
            row.get::<_, i64>(1)?,           // sensor_id
            row.get::<_, i32>(2)?,           // gas_index
            row.get::<_, Option<f64>>(3)?,   // o2_percent
            row.get::<_, Option<f64>>(4)?,   // he_percent
            row.get::<_, Option<f64>>(5)?,   // start_pressure
            row.get::<_, Option<f64>>(6)?,   // end_pressure
            row.get::<_, String>(7)?,        // date
            row.get::<_, String>(8)?,        // time
        ))
    })?;
    
    println!("\nRecent dive_tanks:");
    println!("{:>8} {:>8} {:>5} {:>8} {:>8} {:>10} {:>10} {:>12} {:>10}", 
             "dive_id", "sensor", "gas#", "O2%", "He%", "start_bar", "end_bar", "date", "time");
    println!("{}", "-".repeat(95));
    
    for row in rows {
        let (dive_id, sensor_id, gas_idx, o2, he, start, end, date, time) = row?;
        println!("{:>8} {:>8} {:>5} {:>8} {:>8} {:>10} {:>10} {:>12} {:>10}", 
                 dive_id, sensor_id, gas_idx,
                 o2.map(|v| format!("{:.0}", v)).unwrap_or("-".to_string()),
                 he.map(|v| format!("{:.0}", v)).unwrap_or("-".to_string()),
                 start.map(|v| format!("{:.0}", v)).unwrap_or("-".to_string()),
                 end.map(|v| format!("{:.0}", v)).unwrap_or("-".to_string()),
                 date, time);
    }
    
    // Show dives without tanks
    let mut stmt2 = conn.prepare(
        "SELECT d.id, d.date, d.time FROM dives d WHERE NOT EXISTS (SELECT 1 FROM dive_tanks dt WHERE dt.dive_id = d.id) ORDER BY d.date DESC, d.time DESC LIMIT 10"
    )?;
    let missing = stmt2.query_map([], |row| {
        Ok((
            row.get::<_, i64>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
        ))
    })?;
    
    println!("\nDives WITHOUT dive_tanks records:");
    for row in missing {
        let (id, date, time) = row?;
        println!("  Dive #{}: {} {}", id, date, time);
    }
    
    Ok(())
}
