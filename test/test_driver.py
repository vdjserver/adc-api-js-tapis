#
# test_driver.py
# Test harness for VDJServer ADC API with async query extension
#
# VDJServer Community Data Portal
# ADC API for VDJServer
# https://vdjserver.org
#
# Copyright (C) 2020-2023 The University of Texas Southwestern Medical Center
#
# Author: Scott Christley <scott.christley@utsouthwestern.edu>
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as published
# by the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU Affero General Public License for more details.
#
# You should have received a copy of the GNU Affero General Public License
# along with this program.  If not, see <https:#www.gnu.org/licenses/>.
#

import urllib.request, urllib.parse
import argparse
import json
import os, ssl
import sys
import time
import yaml

PASS_STRING = 'PASS'
FAIL_STRING = 'FAIL'
SKIP_STRING = 'SKIP'

def processQuery(query_url, header_dict, expect_code, query_dict, verbose=False, force=False, expect_format='json'):
    # Build the required JSON data for the post request. The user
    # of the function provides both the header and the query data

    if query_dict:
        # Convert the query dictionary to JSON
        query_json = json.dumps(query_dict)

        # Encode the JSON for the HTTP requqest
        query_json_encoded = query_json.encode('utf-8')
    else:
        query_json_encoded = None

    # Try to connect the URL and get a response. On error return an
    # empty JSON array.
    try:
        # Build the request
        request = urllib.request.Request(query_url, query_json_encoded, header_dict)
        # Make the request and get a handle for the response.
        response = urllib.request.urlopen(request)
        # Read the response
        url_response = response.read()
        # If we have a charset for the response, decode using it, otherwise assume utf-8
        if not response.headers.get_content_charset() is None:
            url_response = url_response.decode(response.headers.get_content_charset())
        else:
            url_response = url_response.decode("utf-8")
        # Check if pass when should have failed
        if response.code != expect_code:
            if verbose:
                print('ERROR: Wrong HTTP status code:', response.code, '!=', expect_code)
            return None

    except urllib.error.HTTPError as e:
        if e.code != expect_code:
            if verbose:
                print('ERROR: Wrong HTTP status code:', e.code, '!=', expect_code)
            return None
        url_response = e.read()
        url_response = url_response.decode("utf-8")
    except urllib.error.URLError as e:
        print('ERROR: Failed to reach the server')
        print('ERROR: Reason =', e.reason)
        return None
    except Exception as e:
        print('ERROR: Unable to process response')
        print('ERROR: Reason =' + str(e))
        return None

    # Convert the response to JSON so we can process it easily.
    if expect_format == 'tsv':
        # TODO: we should probably try to parse when TSV data is returned
        return url_response

    try:
        if len(url_response) == 0:
            if verbose:
                print("WARNING: Empty response, using blank object.")
            json_data = {}
        else:
            json_data = json.loads(url_response)
    except json.decoder.JSONDecodeError as error:
        if force:
            print("WARNING: Unable to process JSON response: " + str(error))
            if verbose:
                print("WARNING: URL response = " + url_response)
            return None
        else:
            print("ERROR: Unable to process JSON response: " + str(error))
            if verbose:
                print("ERROR: URL response = " + url_response)
            return None
    except Exception as error:
        print("ERROR: Unable to process JSON response: " + str(error))
        if verbose:
            print("ERROR: JSON = " + url_response)
        return None

    # Return the JSON data
    return json_data

def getHeaderDict():
    # Set up the header for the post request.
    header_dict = {'accept': 'application/json',
                   'Content-Type': 'application/json'}
    return header_dict

def getAuthToken(base_url, user, password, verbose=False):
    header_dict = getHeaderDict()
    full_url = base_url + '/token'
    data_dict = { "username": user, "password": password }
    token_json = processQuery(full_url, header_dict, 200, data_dict)
    if token_json is None:
        print("ERROR: Failed to authenticate.")
        return None
    if verbose:
        print(token_json)
    return token_json['result']['access_token']

def initHTTP():
    # Deafult OS do not have create cient certificate bundles. It is
    # easiest for us to ignore HTTPS certificate errors in this case.
    if (not os.environ.get('PYTHONHTTPSVERIFY', '') and
        getattr(ssl, '_create_unverified_context', None)): 
        ssl._create_default_https_context = ssl._create_unverified_context

def testAPI(base_url, entry, auth, verbose, force):
    # Get the HTTP header information (in the form of a dictionary)
    header_dict = getHeaderDict()

    if entry['endpoint'] is None:
        print("Test entry", entry['name'], "is missing endpoint.")
        entry['result'] = FAIL_STRING
        entry['result_message'] = 'invalid test entry'
        return

    # Build the full URL
    full_url = base_url + entry['endpoint']

    if entry['auth']:
        if auth is None:
            print("Test entry", entry['name'], "requires authentication.")
            entry['result'] = FAIL_STRING
            entry['result_message'] = 'authentication not provided'
            return
        header_dict['Authorization'] = 'Bearer ' + auth

    if entry['code'] is None:
        print("Test entry", entry['name'], "is missing HTTP status code.")
        entry['result'] = FAIL_STRING
        entry['result_message'] = 'invalid test entry'
        return

    expect_code = entry['code']

    # assume POST method
    if entry.get('method') == 'POST' or entry.get('method') is None:
        if entry['data'] is None:
            print("Test entry", entry['name'], "is missing data file.")
            entry['result'] = FAIL_STRING
            entry['result_message'] = 'invalid test entry'
            return

        # assume files in data directory
        data_file = "data/" + entry['data']

        # Open the JSON query file and read it as a python dict.
        try:
            with open(data_file, 'r') as f:
                data_dict = json.load(f)
        except IOError as error:
            print("ERROR: Unable to open JSON file " + data_file + ": " + str(error))
            entry['result'] = FAIL_STRING
            entry['result_message'] = 'cannot open JSON data file'
            return
        except json.JSONDecodeError as error:
            if force:
                print("WARNING: JSON Decode error detected in " + data_file + ": " + str(error))
                with open(data_file, 'r') as f:
                    data_dict = f.read().replace('\n', '')
            else:
                print("ERROR: JSON Decode error detected in " + data_file + ": " + str(error))
                entry['result'] = FAIL_STRING
                entry['result_message'] = 'invalid JSON data file'
                return
        except Exception as error:
            print("ERROR: Unable to open JSON file " + data_file + ": " + str(error))
            entry['result'] = FAIL_STRING
            entry['result_message'] = 'cannot open JSON data file'
            return
    else:
        # other methods like GET or DELETE
        data_dict = None

    if verbose:
        print('INFO: Performing request on url:', full_url)
        if data_dict:
            print('INFO: Performing POST request with data: ' + str(data_dict))

    # Perform the request.
    data_json = processQuery(full_url, header_dict, expect_code, data_dict, verbose, force)
    if data_json is None:
        entry['result'] = FAIL_STRING
        entry['result_message'] = 'error with request'
        return
    if verbose:
        print('INFO: response: ' + str(data_json))

    # Check the response type
    if entry.get('response_type'):
        if type(data_json).__name__ != entry['response_type']:
            entry['result'] = FAIL_STRING
            entry['result_message'] = 'incorrect response_type'
            return

    # Check the response
    if entry.get('response'):
        for resp in entry['response']:
            if entry.get('response_type') == 'list':
                # response could be in any of the list entries
                found = False
                for dresp in data_json:
                    if entry['response'][resp] in dresp.get(resp):
                        found = True
                if not found:
                    entry['result'] = FAIL_STRING
                    entry['result_message'] = 'incorrect response for ' + resp
                    return
            else:
                if data_json.get(resp) is None:
                    entry['result'] = FAIL_STRING
                    entry['result_message'] = 'incorrect response for ' + resp
                    return
                compare_string = None
                if type(data_json.get(resp)) == str:
                    compare_string = data_json[resp]
                else:
                    compare_string = json.dumps(data_json[resp])
                if entry['response'][resp] not in compare_string:
                    entry['result'] = FAIL_STRING
                    entry['result_message'] = 'incorrect response for ' + resp
                    return

    entry['result'] = PASS_STRING
    return

def getArguments():
    # Set up the command line parser
    parser = argparse.ArgumentParser(
        formatter_class=argparse.RawDescriptionHelpFormatter,
        description=""
    )

    # The URL for the API
    parser.add_argument("base_url")
    # yaml file containing list of tests.
    parser.add_argument("test_list")
    # run single test
    parser.add_argument(
        "-s",
        "--single",
        type=str,
        help="Run single test.")
    # username/password
    parser.add_argument(
        "-u",
        "--user",
        type=str,
        help="Username for authentication.")
    parser.add_argument(
        "-p",
        "--password",
        type=str,
        help="Password for authentication.")
    # Force JSON load flag
    parser.add_argument(
        "--force",
        action="store_const",
        const=True,
        help="Force sending bad JSON even when the JSON can't be loaded.")
    # Verbosity flag
    parser.add_argument(
        "-v",
        "--verbose",
        action="store_true",
        help="Run the program in verbose mode.")

    # Parse the command line arguements.
    options = parser.parse_args()
    return options


if __name__ == "__main__":
    # Get the command line arguments.
    options = getArguments()

    auth = None
    if options.user and options.password:
        auth = getAuthToken(options.base_url, options.user, options.password, options.verbose)
        if auth is None:
            sys.exit(1)

    test_list = yaml.safe_load(open(options.test_list, 'r'))
    #print("Number of tests:", len(test_list))

    # Ensure our HTTP set up has been done.
    initHTTP()

    # perform the tests
    for entry in test_list:
        if options.single:
            if entry['name'] != options.single:
                entry['result'] = SKIP_STRING
                continue
        if entry.get('skip'):
            entry['result'] = SKIP_STRING
            print('SKIP:', entry['name'])
        else:
            testAPI(options.base_url, entry, auth, options.verbose, options.force)
            if entry['result'] == FAIL_STRING:
                print(entry['result'] + ':', entry['name'], '-', entry['result_message'])
            else:
                print(entry['result'] + ':', entry['name'])

    # print summary
    skip_cnt = 0
    pass_cnt = 0
    fail_cnt = 0
    unknown_cnt = 0
    for entry in test_list:
        if entry['result'] == PASS_STRING:
            pass_cnt += 1
        elif entry['result'] == FAIL_STRING:
            fail_cnt += 1
        elif entry['result'] == SKIP_STRING:
            skip_cnt += 1
        else:
            unknown_cnt += 1
    print('')
    print('TEST SUMMARY')
    print('------------')
    print('TOTAL:', len(test_list))
    print(' PASS:', pass_cnt)
    print(' FAIL:', fail_cnt)
    print(' SKIP:', skip_cnt)
    if unknown_cnt > 0:
        print(' ??? :', unknown_cnt)

    # exit with proper code
    error_code = fail_cnt
    sys.exit(error_code)

