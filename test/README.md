# VDJServer ADC API test suite

This test suite does not replace the AIRR ADC API test suite. Those tests should be run
in addition to these as they test much of the query parsing.

You can run the tests using the AIRR Standards docker image which has all of the
necessary python libraries installed. You will need to map the local test suite
directory into the docker container.

```
docker pull airrc/airr-standards
docker run -v $PWD:/work -it airrc/airr-standards bash
cd /work
```

## Test Harness

The tests are divided into a number of suites with individual tests specified in a YAML file.

The python code can be run as follows against a local server:
```
$ python3 test_driver.py http://localhost:8020/airr/v1 repertoire_tests.yaml
$ python3 test_driver.py http://localhost:8020/airr/v1 rearrangement_tests.yaml
$ python3 test_driver.py http://localhost:8020/airr/v1 timeout_tests.yaml
```

Required command line options consist of:
- The base URL to test against
- The test suite description yaml

```
$ python3 test_driver.py -h
usage: test_driver.py [-h] [-s SINGLE] [-u USER] [-p PASSWORD] [--force] [-v] base_url test_list

positional arguments:
  base_url
  test_list

optional arguments:
  -h, --help            show this help message and exit
  -s SINGLE, --single SINGLE
                        Run single test.
  -u USER, --user USER  Username for authentication.
  -p PASSWORD, --password PASSWORD
                        Password for authentication.
  --force               Force sending bad JSON even when the JSON can't be loaded.
  -v, --verbose         Run the program in verbose mode.
```

