// Seeds the DEMO sandbox with mock vehicles and motor policies (group DEMO).
// Never touches MPN/RPS data. Deliberately gives the car BOTH a standalone
// own-damage policy and a separate multi-year third-party policy from another
// insurer, so the concurrent-cover path is exercised by the demo itself.
//   node server/seed/import-demo-vehicles.js --force
import db, { newId, ensureMaster } from '../db.js';

const GROUP = 'DEMO';
const force = process.argv.includes('--force');

const existing = db.data.vehicles.filter(v => v.group === GROUP);
if (existing.length && !force) {
  console.log(`${existing.length} DEMO vehicle(s) already present — pass --force to replace them.`);
  process.exit(0);
}

const VEHICLES = [
  {
    registrationNo: 'MH01AB4321', vehicleClass: 'CAR_4W', holder: 'Aditya',
    make: 'Hyundai', model: 'Creta SX (O) 1.5 Petrol', yearOfManufacture: 2023,
    fuelType: 'Petrol', rtoLocation: 'MUMBAI CENTRAL', rtoCode: 'MH-01',
    engineNo: 'G4FGDM123456', chassisNo: 'MALC381CLPM123456', cubicCapacity: 1497,
    seatingCapacity: 5, bodyType: 'SUV', colour: 'ABYSS BLACK', zone: 'A',
    policies: [
      {
        insurerName: 'Acme General Insurance', policyType: 'OD_ONLY',
        policyNo: 'DEMO-OD-4321-2026', startDate: '2026-06-01', endDate: '2027-05-31',
        idvTotal: 1450000, idvVehicle: 1450000, basicPremium: 4200, addOnPremium: 5100,
        netOdPremium: 9300, cgst: 837, sgst: 837, grossPremium: 10974,
        ncbPercent: 25, compulsoryDeductible: 2000, financierType: 'Not Financed'
      },
      {
        insurerName: 'Sunrise Motor Insurance', policyType: 'TP_ONLY',
        policyNo: 'DEMO-TP-4321-2026', startDate: '2023-06-01', endDate: '2026-05-31',
        netTpPremium: 7350, grossPremium: 7350
      }
    ]
  },
  {
    registrationNo: 'MH02CD8765', vehicleClass: 'SCOOTER_2W', holder: 'Neha',
    make: 'TVS', model: 'Jupiter 125', yearOfManufacture: 2024, fuelType: 'Petrol',
    rtoLocation: 'ANDHERI', rtoCode: 'MH-02', cubicCapacity: 124, seatingCapacity: 2,
    bodyType: 'Scooter', colour: 'TITANIUM GREY',
    policies: [
      {
        insurerName: 'Acme General Insurance', policyType: 'COMPREHENSIVE',
        policyNo: 'DEMO-PKG-8765-2026', startDate: '2026-09-20', endDate: '2027-09-19',
        idvTotal: 72000, idvVehicle: 72000, basicPremium: 1180, netOdPremium: 980,
        netTpPremium: 714, cgst: 171, sgst: 171, grossPremium: 2036, ncbPercent: 20
      }
    ]
  }
];

const vehicles = [];
const policies = [];
for (const v of VEHICLES) {
  const { policies: pols, ...rest } = v;
  ensureMaster(GROUP, 'holders', rest.holder);
  const vehicle = { ...rest, id: newId('veh'), group: GROUP, status: 'owned' };
  vehicles.push(vehicle);
  for (const p of pols) {
    ensureMaster(GROUP, 'vehicleInsurers', p.insurerName);
    policies.push({
      ...p,
      id: newId('vehpol'),
      group: GROUP,
      vehicleId: vehicle.id,
      status: 'active',
      renewedFromId: null,
      renewedToId: null,
      renewedOn: null,
      documentOriginalName: null,
      documentUploadedAt: null
    });
  }
}

const oldPolicyIds = new Set(db.data.vehiclePolicies.filter(p => p.group === GROUP).map(p => p.id));
db.data.vehicles = db.data.vehicles.filter(v => v.group !== GROUP).concat(vehicles);
db.data.vehiclePolicies = db.data.vehiclePolicies.filter(p => p.group !== GROUP).concat(policies);
db.data.vehiclePremiums = db.data.vehiclePremiums.filter(x => !oldPolicyIds.has(x.policyId));
await db.write();

console.log(`Seeded ${vehicles.length} DEMO vehicle(s) and ${policies.length} polic(y/ies).`);
