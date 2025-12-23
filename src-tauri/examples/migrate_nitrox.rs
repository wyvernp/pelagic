use rusqlite::Connection;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let db_path = std::env::args().nth(1).unwrap_or_else(|| "pelagic.db".to_string());
    println!("Opening database: {}", db_path);
    
    let conn = Connection::open(&db_path)?;
    
    // Check if nitrox_o2_percent column exists
    let has_column: bool = conn.query_row(
        "SELECT COUNT(*) > 0 FROM pragma_table_info('dives') WHERE name = 'nitrox_o2_percent'",
        [],
        |row| row.get(0),
    )?;
    
    if !has_column {
        println!("Column nitrox_o2_percent does not exist - migration already complete!");
        return Ok(());
    }
    
    // Count dives with nitrox data that need migration
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM dives d WHERE d.nitrox_o2_percent IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dive_tanks dt WHERE dt.dive_id = d.id)",
        [],
        |row| row.get(0),
    )?;
    
    println!("Found {} dives with nitrox_o2_percent data to migrate", count);
    
    // Migrate data
    let migrated = conn.execute(
        "INSERT INTO dive_tanks (dive_id, sensor_id, gas_index, o2_percent, start_pressure_bar, end_pressure_bar)
         SELECT d.id, 0, 0, d.nitrox_o2_percent, NULL, NULL
         FROM dives d 
         WHERE d.nitrox_o2_percent IS NOT NULL 
           AND NOT EXISTS (SELECT 1 FROM dive_tanks dt WHERE dt.dive_id = d.id)",
        [],
    )?;
    
    println!("Migrated {} dives to dive_tanks", migrated);
    
    // Drop the column
    println!("Dropping nitrox_o2_percent column...");
    conn.execute("ALTER TABLE dives DROP COLUMN nitrox_o2_percent", [])?;
    
    println!("Migration complete!");
    
    // Verify
    let tank_count: i64 = conn.query_row("SELECT COUNT(*) FROM dive_tanks", [], |row| row.get(0))?;
    println!("Total dive_tanks records: {}", tank_count);
    
    Ok(())
}
