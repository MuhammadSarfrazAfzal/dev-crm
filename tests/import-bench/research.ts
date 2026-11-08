/**
 * Research-agent style write-ups: numbered entries with labelled lines, sentences that
 * mention extra phones and emails, alternate addresses, and stray source-site words.
 * The first is the captain's real example, kept exactly as pasted.
 */
import type { Sample } from "./corpus";

export const RESEARCH: Sample[] = [
  {
    name: "research write-up (captain's example)",
    kind: "paste",
    text: `1. Virtual Zone LLC

Phone: (305) 599-0778 
yellowpages
Email: marketing@virtualzoneusa.com. Their Facebook page also lists sales3@virtualzone.com and (786) 502-6263. 
Virtual Zone - Doral, FL 33172
 +2
Address: 2470 NW 102nd Place Suite 106, Doral, FL. Yelp and the Yellow Pages list 2350 NW 102nd Pl, Doral, FL 33172 instead, so confirm which is current. 
facebook
yellowpages
Contact: Maria Lara, the founder, who launched the business in 2009 with her brother Jorge Lara. 
prweb
Why a fit: a large wholesale distributor of cell phones, consoles and cameras from Samsung, Apple and other brands. 
prweb

2. TM Cell (TMcell, Inc.)

Phone: +1 (305) 421-9938 
tmcell
Email: sales@tmcell.com 
tmcell
Address: 10205 NW 19th Street, Suite 101, Miami, FL 33172. LinkedIn lists 8800 NW 23rd Street, Miami, FL 33172, which may be an older location. 
tmcell
linkedin
Contact: Frank Cheng, listed as president. 
manta
Why a fit: a wholesale distributor of wireless handsets and accessories, founded in 2004, serving the Americas. 
fit

3. Telex Corp (also listed as AR Global Products)

Phone: (305) 200-8888. The BBB lists (786) 342-8259. 
waze
bbb
Email: sam@telexcorponline.com 
kadorf
Address: 10900 NW 21st St Suite 100, Miami, FL 33172 
waze
Contact: Raj Verma, listed as CEO and President. 
rocketreach
Why a fit: sells new and used phones in bulk to wholesalers, retailers and repair shops, and runs Apple buyback programs. Buyback and trade-in tracking is a strong match for your POS. 
rocketreach

4. FIFO USA, Inc. (also listed as Global Cellular Technologies)

Phone: 1-305-592-7906 
flbestdeal
Email: info@fifousa.com 
flbestdeal
Address: 10900 NW 21st Street Suite 210, Miami, FL 33172 
flbestdeal
Contact: no owner name found.
Why a fit: listed among Miami cell phone wholesale companies. 
flbestdeal

5. Global Phone Solutions (GPS)

Phone: 1786-254-7911 
globalphonesolutions
Email: sales@globalphonesolutions.us 
globalphonesolutions
Address: 10465 NW 29th Terrace, Doral, Miami, FL 33172 
globalphonesolutions
Contact: no owner name found.
Why a fit: a mobility distribution company serving the US, Latin America and the Caribbean. 
globalphonesolutions
`,
    expected: [
      { company: "Virtual Zone LLC", contact: "Maria Lara", phones: ["(305) 599-0778", "(786) 502-6263"], emails: ["marketing@virtualzoneusa.com", "sales3@virtualzone.com"], address: "2470 NW 102nd Place Suite 106", city: "Doral", state: "FL" },
      { company: "TM Cell (TMcell, Inc.)", contact: "Frank Cheng", phones: ["+1 (305) 421-9938"], emails: ["sales@tmcell.com"], address: "10205 NW 19th Street, Suite 101", city: "Miami", state: "FL", zip: "33172" },
      { company: "Telex Corp", contact: "Raj Verma", phones: ["(305) 200-8888", "(786) 342-8259"], emails: ["sam@telexcorponline.com"], address: "10900 NW 21st St Suite 100", city: "Miami", state: "FL", zip: "33172" },
      { company: "FIFO USA, Inc.", phones: ["1-305-592-7906"], emails: ["info@fifousa.com"], address: "10900 NW 21st Street Suite 210", city: "Miami", state: "FL", zip: "33172" },
      { company: "Global Phone Solutions (GPS)", phones: ["1786-254-7911"], emails: ["sales@globalphonesolutions.us"], address: "10465 NW 29th Terrace, Doral", city: "Miami", state: "FL", zip: "33172" },
    ],
  },
  {
    name: "research write-up in markdown",
    kind: "paste",
    text: `### 1. Lone Star Wireless Supply
- **Phone:** (214) 555-0500
- **Email:** sales@lonestarwireless.example.com
- **Address:** 2600 Ross Ave, Dallas, TX 75201
- **Contact:** Hector Ruiz (Owner)
- **Why a fit:** buys refurbished iPhones every week.

### 2. Metroplex Mobile Distributors
- **Phone:** 972-555-0501; Google also shows 972-555-0502
- **Email:** info@metroplexmobile.example.com
- **Address:** 1400 N Central Expy Suite 300, Richardson, TX 75080
- **Contact:** no contact found
- **Notes:** family-run, two locations.`,
    expected: [
      { company: "Lone Star Wireless Supply", contact: "Hector Ruiz", phones: ["(214) 555-0500"], emails: ["sales@lonestarwireless.example.com"], address: "2600 Ross Ave", city: "Dallas", state: "TX", zip: "75201" },
      { company: "Metroplex Mobile Distributors", phones: ["972-555-0501", "972-555-0502"], emails: ["info@metroplexmobile.example.com"], address: "1400 N Central Expy Suite 300", city: "Richardson", state: "TX", zip: "75080" },
    ],
  },
  {
    name: "research write-up with other labels",
    kind: "paste",
    text: `1) Gulf Coast Cellular
Tel: 713-555-0510
E-mail: gulf@coastcellular.example.com
Website: www.gulfcoastcellular.example.com
google
Location: 9200 Bellaire Blvd Ste 120, Houston, TX 77036
Owner: Thanh Nguyen, owner since 2015.

2) Bayou Phone Wholesale
Tel: (281) 555-0511
E-mail: orders@bayouphone.example.com
yelp
Location: 12300 Main St, Houston, TX 77035
Owner: unknown`,
    expected: [
      { company: "Gulf Coast Cellular", contact: "Thanh Nguyen", phones: ["713-555-0510"], emails: ["gulf@coastcellular.example.com"], website: "gulfcoastcellular.example.com", address: "9200 Bellaire Blvd Ste 120", city: "Houston", state: "TX", zip: "77036" },
      { company: "Bayou Phone Wholesale", phones: ["(281) 555-0511"], emails: ["orders@bayouphone.example.com"], address: "12300 Main St", city: "Houston", state: "TX", zip: "77035" },
    ],
  },
];
