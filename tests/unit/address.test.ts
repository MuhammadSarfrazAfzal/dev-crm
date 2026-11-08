import { describe, expect, it } from "vitest";
import { findAddress } from "@/lib/import/address";

const f = (s: string) => {
  const a = findAddress(s);
  return a && { street: a.street, city: a.city, state: a.state, zip: a.zip };
};

describe("finding an address in messy text", () => {
  it.each([
    ["Metro Wireless Repair | 1200 W Madison St Chicago IL 60607 ask for Tony", { street: "1200 W Madison St", city: "Chicago", state: "IL", zip: "60607" }],
    ["Lakeview Phone Fix | 3150 N Broadway, Chicago, IL 60657", { street: "3150 N Broadway", city: "Chicago", state: "IL", zip: "60657" }],
    ["2700 McKinney Ave Dallas, TX 75204", { street: "2700 McKinney Ave", city: "Dallas", state: "TX", zip: "75204" }],
    ["4420 Ross Ave, Dallas TX 75204", { street: "4420 Ross Ave", city: "Dallas", state: "TX", zip: "75204" }],
    ["Loc: 2900 Peachtree Rd NE Atlanta GA 30305", { street: "2900 Peachtree Rd NE", city: "Atlanta", state: "GA", zip: "30305" }],
    ["Addr: 3330 Piedmont Rd, Atlanta, Georgia 30305", { street: "3330 Piedmont Rd", city: "Atlanta", state: "GA", zip: "30305" }],
    ["500 E Houston St San Antonio TX 78205", { street: "500 E Houston St", city: "San Antonio", state: "TX", zip: "78205" }],
    ["1100 16th Ave S Nashville TN 37212", { street: "1100 16th Ave S", city: "Nashville", state: "TN", zip: "37212" }],
    ["2000 Broadway, Nashville, TN 37203", { street: "2000 Broadway", city: "Nashville", state: "TN", zip: "37203" }],
    ["5085 Westheimer Rd Suite 2600\nHouston, TX 77056", { street: "5085 Westheimer Rd Suite 2600", city: "Houston", state: "TX", zip: "77056" }],
    ["1980 Festival Plaza Dr, Las Vegas NV 89135", { street: "1980 Festival Plaza Dr", city: "Las Vegas", state: "NV", zip: "89135" }],
    ["QUICK FIX CELLULAR |  | DALLAS TX 75201", { street: undefined, city: "DALLAS", state: "TX", zip: "75201" }],
    ["Tempe Tech Fix - | - Tempe, AZ", { street: undefined, city: "Tempe", state: "AZ", zip: undefined }],
    ["Cell phone store · 2301 S Lamar Blvd", { street: "2301 S Lamar Blvd", city: undefined, state: undefined, zip: undefined }],
    ["Mobile phone repair shop · 9600 S I-35 Frontage Rd", { street: "9600 S I-35 Frontage Rd", city: undefined, state: undefined, zip: undefined }],
  ])("%s", (text, want) => expect(f(text)).toEqual(want));

  it("leaves words that only look like states alone", () => {
    expect(findAddress("Ask for Tony in the morning")).toBeNull();
    expect(findAddress("Open ⋅ Closes 7 PM")).toBeNull();
  });
});

describe("addresses from a real directory", () => {
  it.each([
    ["400 N Highway 35 Byp, Alvin, TX 77511", "400 N Highway 35 Byp", "Alvin"],
    ["381 S LOOP 336 W SUITE 600 Conroe, TX 77304", "381 S LOOP 336 W SUITE 600", "Conroe"],
    ["1403 N LOOP 336 W STE B2, Conroe, TX 77304", "1403 N LOOP 336 W STE B2", "Conroe"],
    ["4505 Garth Rd A, Baytown TX 77521", "4505 Garth Rd A", "Baytown"],
    ["11930 Barker Cypress Rd, Suite 400, Cypress TX 77433", "11930 Barker Cypress Rd, Suite 400", "Cypress"],
    ["500 Baybrook Mall, Ste 5513, Friendswood, TX 77546", "500 Baybrook Mall, Ste 5513", "Friendswood"],
    ["812 W Dallas St. #110, Conroe, TX 77301", "812 W Dallas St. #110", "Conroe"],
  ])("%s", (text, street, city) => expect(f(text)).toMatchObject({ street, city, state: "TX" }));
});

it("keeps a bare suite number with its street", () => {
  expect(findAddress("5198 Rufe Snow Dr, 121, North Richland Hills, TX 76180")).toMatchObject({ street: "5198 Rufe Snow Dr, 121", city: "North Richland Hills", state: "TX", zip: "76180" });
});
