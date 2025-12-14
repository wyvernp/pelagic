use fitparser::{self, FitDataRecord, Value};
use std::collections::HashMap;
use std::fs::File;
use std::io::BufReader;

fn main() {
    let path = "../garmin2025-09-16-11-19-18.fit";
    
    let file = File::open(path).expect("Failed to open FIT file");
    let mut reader = BufReader::new(file);
    
    let records = fitparser::from_reader(&mut reader).expect("Failed to parse FIT file");
    
    println!("Parsed {} records from FIT file\n", records.len());
    
    // Group records by type
    let mut record_types: HashMap<String, Vec<&FitDataRecord>> = HashMap::new();
    
    for record in &records {
        let kind = record.kind().to_string();
        record_types.entry(kind).or_insert(Vec::new()).push(record);
    }
    
    // Print summary of record types
    println!("Record types found:");
    for (kind, recs) in &record_types {
        println!("  {} - {} records", kind, recs.len());
    }
    println!();
    
    // Print details of each record type (first 3 of each)
    for (kind, recs) in &record_types {
        println!("=== {} ({} total) ===", kind, recs.len());
        for (i, rec) in recs.iter().take(3).enumerate() {
            println!("  Record {}:", i);
            for field in rec.fields() {
                let name = field.name();
                let value = field.value();
                // Check for pressure-related fields
                let highlight = if name.to_lowercase().contains("pressure") 
                    || name.to_lowercase().contains("tank") 
                    || name.to_lowercase().contains("air")
                    || name.to_lowercase().contains("gas") {
                    " <-- PRESSURE/TANK RELATED"
                } else {
                    ""
                };
                println!("    {}: {:?}{}", name, value, highlight);
            }
        }
        println!();
    }
}
