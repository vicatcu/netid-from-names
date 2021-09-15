const rp = require('request-promise');
const stringif = require('csv-parse/lib/sync');
const fs = require('fs');
const argv = require('minimist')(process.argv.slice(2));
const path = require('path');

async function run() {

  const namesFilesname = argv.input || './input.csv';
  const outputFile = argv.output || './output.csv';
  const errorFile = argv.error || './error.csv';

  const namesFileContent = fs.readFileSync(path.resolve('./', namesFilesname), 'utf8');
  const namesParsedContent = namesFileContent.split(/[\r\n]+/).map(v => v.replace(/\s+/g, '+'));

  const records = {};
  const errors = [];

  const options = {
    method: 'GET',
    uri: 'https://www.cornell.edu/search/people.cfm?q=',
    resolveWithFullResponse: true,
    followAllRedirects: false,
    followRedirect: false
  };
  let studentName;
  for (const n of namesParsedContent) {
    try {
      studentName = n;
      const opts = Object.assign({}, options);
      opts.uri += studentName;

      const res = await rp(opts);

      let netids = res.body.split('NETID:');
      if (netids.length === 2) {
        const td = netids[1].split('<td>')[1];
        let netid = td.split('</td>')[0].trim();
        if (netid) {
          // this is the good stuff, works for non-current-students
          console.log('NETID = ' + netid);
          records[netid] = studentName;
        } else {
          errors.push(studentName + ' (Strange)');
        }
      } else {
        if (netids.length > 2) {
          errors.push(studentName + ' (Ambiguous)');
        } else {
          // run it again but follow redirects
          delete opts.followAllRedirects;
          delete opts.followRedirect;
          const res2 = await rp(opts);

          if (res2.body.match(/Students \(1\)/g).length === 1) {
            const bodyAfterStudents = res2.body.split(/Students \(1\)/g)[1];
            const netIDPlus = bodyAfterStudents.split(/netid=/g)[1];
            const netID = netIDPlus.split(/"/g)[0].trim();
            console.log('NETID = ' + netID);
            records[netid] = studentName;
          } else {
            errors.push(studentName + ' (Not Found)');
          }
        }
      }

    } catch (e) {
      // this is also the good stuff, strangely, for current students
      if (e.response) {
        const location = e.response.headers.location;
        if (location && location.includes("?netid=")) {
          const netid = location.split("?netid=")[1];
          console.log('NETID = ' + netid);
          records[netid] = studentName;
        } else {
          errors.push(studentName + '(Error)');
        }
      } else {
        // console.error(e.message || e, e.stack);
        errors.push(studentName + ' (Unexpected)');
      }
    }
  }

  // write the output files
  const keys = Object.keys(records).sort();
  let output = '';
  for (const k of keys) {
    output += `${records[k].replace('+', ' ')},${k}\r\n`;
  }
  fs.writeFileSync(path.resolve('./', outputFile), output, 'utf8');

  output = '';
  for (const e of errors) {
    output += `${e}\r\n`;
  }
  fs.writeFileSync(path.resolve('./', errorFile), output, 'utf8');
}

run().catch(e => console.error(e.message || e, e.stack));