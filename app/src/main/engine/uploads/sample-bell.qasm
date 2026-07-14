OPENQASM 3.0;
include "stdgates.inc";

qubit[4] q;
bit[4] c;

h q[0];
for int i in [1:3] {
    cx q[0], q[i];
}
rz(0.4) q[1];
rz(0.4) q[2];

c = measure q;
